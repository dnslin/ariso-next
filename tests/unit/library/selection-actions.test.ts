import { expect, it } from 'vitest';
import { selectionBatchActions } from '../../../src/app/library/library-actions';
import { batchSelectionItems } from '../../../src/components/library/use-library-batch';
import type { SelectedLibraryItem } from '../../../src/server/library/selection-types';

const item = (
  id: string,
  visibility: 'public' | 'private',
  hasAlbums = false,
): SelectedLibraryItem => ({
  id,
  displayName: id,
  thumbnailUrl: null,
  storage: { id: 'local', name: '本地', enabled: true },
  visibility,
  hasAlbums,
});

it('omits actions without a selection and hides an already-uniform visibility', () => {
  expect(selectionBatchActions([], false)).toEqual([]);
  for (const compact of [false, true]) {
    const publicActions = selectionBatchActions([item('a', 'public')], compact);
    expect(publicActions).not.toContain('public');
    expect(publicActions).toContain('private');
    const privateActions = selectionBatchActions(
      [item('b', 'private')],
      compact,
    );
    expect(privateActions).not.toContain('private');
    expect(privateActions).toContain('public');
    expect(privateActions).not.toContain('remove-albums');
  }
});

it('keeps mixed visibility choices and album removal only when membership exists', () => {
  const items = [item('a', 'public'), item('b', 'private', true)];
  const actions = selectionBatchActions(items, true);
  expect(actions).toContain('public');
  expect(actions).toContain('private');
  expect(actions).toContain('remove-albums');
  expect(batchSelectionItems('public', items).map((entry) => entry.id)).toEqual(
    ['b'],
  );
  expect(
    batchSelectionItems('private', items).map((entry) => entry.id),
  ).toEqual(['a']);
  expect(batchSelectionItems('public', [items[0]])).toEqual([]);
  expect(batchSelectionItems('add-albums', items)).toEqual(items);
});

it('keeps low-frequency tag and processing operations out of the compact context menu', () => {
  const items = [item('a', 'private', true)];
  expect(selectionBatchActions(items, true)).toEqual([
    'copy',
    'add-albums',
    'public',
    'remove-albums',
    'trash',
  ]);
  const full = selectionBatchActions(items, false);
  for (const action of ['add-tags', 'remove-tags', 'reprocess'])
    expect(full).toContain(action);
});

it('excludes records whose permanent deletion has started from restore submission', () => {
  const items = [
    item('ready', 'private'),
    { ...item('deleting', 'private'), deletionStatus: 'deleting' as const },
    {
      ...item('cleanup-failed', 'private'),
      deletionStatus: 'cleanup_failed' as const,
    },
  ];
  expect(
    batchSelectionItems('restore', items).map((entry) => entry.id),
  ).toEqual(['ready']);
});
