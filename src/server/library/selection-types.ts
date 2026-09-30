import type { LibraryItem } from './types.ts';

export type SelectedLibraryItem = Pick<
  LibraryItem,
  'id' | 'displayName' | 'thumbnailUrl' | 'storage'
>;

export interface LibrarySelectionRequest {
  ids: string[];
  query: string;
}

export interface LibrarySelection {
  items: SelectedLibraryItem[];
}
