import type { VersionKind } from '../media/schema.ts';
import type { LibraryFilters } from './query-schema.ts';

export type LibraryCopyFormat = 'url' | 'markdown' | 'html';
export type LibraryCopyVersion = 'default' | VersionKind;

export interface LibraryCopyRequest {
  ids: string[];
  query: string;
  version: LibraryCopyVersion;
  format: LibraryCopyFormat;
}

export interface LibraryCopyItem {
  imageId: string;
  displayName: string;
  sortKey: { value: number; id: string };
  actualVersion: VersionKind;
  line: string;
  accessWarning: string | null;
  originalDisclosure: boolean;
}

export interface LibraryCopyUnavailable {
  imageId: string;
  displayName: string;
  reason: string;
  actualVersion: VersionKind | null;
}

export interface LibraryCopyResponse {
  items: LibraryCopyItem[];
  unavailable: LibraryCopyUnavailable[];
  sort: LibraryFilters['sort'];
}
