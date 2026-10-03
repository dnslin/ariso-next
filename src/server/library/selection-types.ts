import type { LibraryItem } from './types.ts';

export type SelectedLibraryItem = {
  sourcePage?: number;
  processingStatus?: LibraryItem['processingStatus'];
  batchFailure?: string;
  byteSize?: number;
} & Pick<LibraryItem, 'id' | 'displayName' | 'thumbnailUrl' | 'storage'>;

export interface LibrarySelectionRequest {
  ids: string[];
  query: string;
}

export interface LibrarySelection {
  items: SelectedLibraryItem[];
}
