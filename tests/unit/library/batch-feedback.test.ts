import { describe, expect, it } from 'vitest';
import {
  batchSuccessFeedback,
  type BatchSnapshotItem,
} from '../../../src/components/library/use-library-batch';
import type {
  BatchCommand,
  BatchItemResult,
} from '../../../src/server/library/batch-types';

const actions = [
  ['public', { type: 'visibility', visibility: 'public' }, '批量设为公开完成'],
  [
    'private',
    { type: 'visibility', visibility: 'private' },
    '批量设为私有完成',
  ],
  ['add-tags', { type: 'add-tags', tagIds: ['tag-one'] }, '添加标签完成'],
  ['remove-tags', { type: 'remove-tags', tagIds: ['tag-one'] }, '移除标签完成'],
] satisfies [string, BatchCommand, string][];
const snapshotItem = (id: string): BatchSnapshotItem => ({
  id,
  displayName: `${id}.png`,
  thumbnailUrl: `/i/${id}?type=thumbnail`,
  storage: { id: 'local', name: '本地', enabled: true },
  source: '第2页',
  inCurrentPage: true,
});
const results = (
  statuses: Exclude<BatchItemResult['status'], 'accepted'>[],
): BatchItemResult[] =>
  statuses.map((status, index) => ({
    id: `image-${index}`,
    status,
    message: status === 'failed' ? '写入失败' : '状态已确认',
    inQuery: true,
  }));
const complete = (
  command: BatchCommand | null,
): Parameters<typeof batchSuccessFeedback>[0] => ({
  command,
  items: [snapshotItem('image-0'), snapshotItem('image-1')],
  results: results(['changed', 'unchanged']),
  unknownIds: [],
  unsentIds: [],
});

// These tests verify feedback data only. Mounted workflow, refresh timing,
// selection, focus and Toast assertions belong in e2e/library-batch.mjs.
describe.each(actions)('%s success feedback', (_action, command, title) => {
  it('uses the confirmed changed and unchanged counts', () => {
    expect(batchSuccessFeedback(complete(command))).toEqual({
      title,
      description: '1张已修改 · 1张无需修改',
    });
  });

  it('reports zero changes when all submitted items were unchanged', () => {
    const workspace = complete(command);
    workspace.results = results(['unchanged', 'unchanged']);
    expect(batchSuccessFeedback(workspace)).toEqual({
      title,
      description: '0张已修改 · 2张无需修改',
    });
  });

  it('counts only the retry snapshot, excluding earlier confirmed results', () => {
    const workspace = complete(command);
    workspace.items = [snapshotItem('image-1')];
    workspace.results = results(['unchanged', 'changed']);
    expect(batchSuccessFeedback(workspace)).toEqual({
      title,
      description: '1张已修改 · 0张无需修改',
    });
  });

  it('counts only the final snapshot after 200 previously confirmed items', () => {
    const workspace = complete(command);
    workspace.items = [snapshotItem('image-200')];
    workspace.results = [
      ...results(Array.from({ length: 200 }, () => 'changed')),
      { id: 'image-200', status: 'changed', message: '已修改', inQuery: true },
    ];
    expect(batchSuccessFeedback(workspace)).toEqual({
      title,
      description: '1张已修改 · 0张无需修改',
    });
  });

  it.each([
    'unknown',
    'unsent',
    'valid-failure',
    'invalid-failure',
    'missing-result',
  ] as const)('returns no success feedback with %s', (condition) => {
    const workspace = complete(command);
    if (condition === 'unknown') workspace.unknownIds = ['image-1'];
    if (condition === 'unsent') workspace.unsentIds = ['image-1'];
    if (condition === 'valid-failure' || condition === 'invalid-failure')
      workspace.results[1] = {
        id: 'image-1',
        status: 'failed',
        message: '无法写入',
        inQuery: condition === 'valid-failure',
      };
    if (condition === 'missing-result') workspace.results[1].id = 'other';
    expect(batchSuccessFeedback(workspace)).toBeNull();
  });

  it('returns no success feedback for an empty selection', () => {
    const workspace = complete(command);
    workspace.items = [];
    workspace.results = [];
    expect(batchSuccessFeedback(workspace)).toBeNull();
  });
});

it('matches confirmed results to snapshot IDs regardless of response order', () => {
  const workspace = complete({ type: 'visibility', visibility: 'public' });
  workspace.results.reverse();
  expect(batchSuccessFeedback(workspace)).toEqual({
    title: '批量设为公开完成',
    description: '1张已修改 · 1张无需修改',
  });
});

it.each([
  ['no command', null],
  ['restore', { type: 'restore' }],
  ['trash', { type: 'trash' }],
  ['add-albums', { type: 'add-albums', albumIds: ['album-one'] }],
  ['remove-albums', { type: 'remove-albums', albumIds: ['album-one'] }],
] satisfies [string, BatchCommand | null][])(
  'returns no success feedback for %s',
  (_action, command) => {
    expect(batchSuccessFeedback(complete(command))).toBeNull();
  },
);
