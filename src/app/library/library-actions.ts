import type { BatchAction } from '../../components/library/use-library-batch';
import type { SelectedLibraryItem } from '../../server/library/selection-types';

export type SelectionBatchAction = BatchAction | 'reprocess' | 'copy';

export function selectionBatchActions(
  items: SelectedLibraryItem[],
  compact: boolean,
): SelectionBatchAction[] {
  if (!items.length) return [];
  return [
    'copy',
    'add-albums',
    ...(items.some((item) => item.visibility === 'private')
      ? (['public'] as const)
      : []),
    ...(items.some((item) => item.visibility === 'public')
      ? (['private'] as const)
      : []),
    ...(items.some((item) => item.hasAlbums)
      ? (['remove-albums'] as const)
      : []),
    ...(!compact ? (['add-tags', 'remove-tags', 'reprocess'] as const) : []),
    'trash',
  ];
}
