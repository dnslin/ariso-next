import { expect, it } from 'vitest';
import { parseLibraryBatch } from '../../../src/server/library/batch.ts';
import type { BatchCommand } from '../../../src/server/library/batch-types.ts';

const taskId = '9b621900-d4c6-4306-9185-7768fba66eb4';

const request = {
  ids: ['image'],
  query: '',
  command: { type: 'trash' },
  mode: 'apply',
};
it('accepts 200 explicit image IDs, normalizes filters and deduplicates actual IDs and relationship targets', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `image-${i}`);
  expect(parseLibraryBatch({ ...request, ids }).ids).toEqual(ids);
  expect(
    parseLibraryBatch({
      ...request,
      ids: ['b', 'a', 'b'],
      query: 'q=+travel+&tagId=b&tagId=a&tagId=b',
      command: { type: 'add-albums', albumIds: ['b', 'a', 'b'] },
    }),
  ).toMatchObject({
    ids: ['b', 'a'],
    filters: { q: 'travel', tagIds: ['a', 'b'] },
    command: { type: 'add-albums', albumIds: ['b', 'a'] },
  });
});
it.each([
  { ...request, ids: [] },
  { ...request, ids: [''] },
  { ...request, ids: Array.from({ length: 201 }, (_, i) => `image-${i}`) },
  { ...request, query: 'page=1' },
  { ...request, query: 'cursor=abc' },
  { ...request, query: 'scope=trash' },
  { ...request, query: 'scope=album' },
  { ...request, query: 'pageSize=200' },
  { ...request, query: 'unknown=1' },
  { ...request, query: 'q=a&q=b' },
  { ...request, command: { type: 'restore' } },
  { ...request, command: { type: 'add-albums', albumIds: [] } },
  { ...request, command: { type: 'remove-albums', albumIds: [] } },
  { ...request, command: { type: 'add-tags', tagIds: [] } },
  { ...request, command: { type: 'remove-tags', tagIds: [] } },
  { ...request, command: { type: 'remove-tags', tagIds: [''] } },
  { ...request, command: { type: 'visibility', visibility: 'hidden' } },
  { ...request, command: { type: 'trash', permanent: true } },
  { ...request, command: { type: 'reprocess' } },
  { ...request, command: { type: 'reprocess', scope: 'all', taskIds: {} } },
  {
    ...request,
    command: { type: 'reprocess', scope: 'all', taskIds: { other: taskId } },
  },
  {
    ...request,
    command: {
      type: 'reprocess',
      scope: 'all',
      taskIds: { image: taskId, other: taskId },
    },
  },
  {
    ...request,
    command: { type: 'reprocess', scope: 'all', taskIds: { image: 'invalid' } },
  },
  {
    ...request,
    ids: ['image', 'other'],
    command: {
      type: 'reprocess',
      scope: 'all',
      taskIds: { image: taskId, other: taskId },
    },
  },
  { ...request, allMatching: true },
  { ...request, mode: undefined },
  { ...request, mode: 'retry' },
  { ...request, query: undefined },
])(
  'rejects invalid structure, empty goals or unsupported commands before execution: %j',
  (input) => {
    expect(() => parseLibraryBatch(input)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  },
);
it('accepts both explicit modes and the existing trash scope for restore, without page-dependent input', () => {
  for (const mode of ['apply', 'check']) {
    expect(
      parseLibraryBatch({
        ...request,
        command: { type: 'restore' },
        query: 'scope=trash',
        mode,
      }),
    ).toMatchObject({
      command: { type: 'restore' },
      filters: { scope: 'trash' },
      mode,
    });
    for (const command of [
      { type: 'add-albums', albumIds: ['album'] },
      { type: 'remove-albums', albumIds: ['album'] },
      { type: 'add-tags', tagIds: ['tag'] },
      { type: 'remove-tags', tagIds: ['tag'] },
      { type: 'visibility', visibility: 'public' },
      { type: 'trash' },
    ] as BatchCommand[])
      expect(
        parseLibraryBatch({
          ...request,
          command,
          query: 'scope=album&albumId=album',
          mode,
        }).command,
      ).toEqual(command);
  }
});

it.each(['all', 'compressed', 'thumbnail', 'watermark'] as const)(
  'accepts explicit %s task identities in apply and check without selecting extra images',
  (scope) => {
    for (const mode of ['apply', 'check']) {
      const command = { type: 'reprocess', scope, taskIds: { image: taskId } };
      expect(parseLibraryBatch({ ...request, command, mode }).command).toEqual(
        command,
      );
    }
  },
);
