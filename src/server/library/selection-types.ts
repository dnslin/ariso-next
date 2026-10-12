import type { LibraryItem } from './types.ts';

export type SelectedLibraryItem = {
  sourcePage?: number;
  processingStatus?: LibraryItem['processingStatus'];
  batchFailure?: string;
  byteSize?: number;
  deletionStatus?: LibraryItem['deletionStatus'];
} & Pick<
  LibraryItem,
  'id' | 'displayName' | 'thumbnailUrl' | 'storage' | 'visibility' | 'hasAlbums'
>;

export interface LibrarySelectionRequest {
  ids: string[];
  query: string;
}

export interface LibrarySelection {
  items: SelectedLibraryItem[];
}
