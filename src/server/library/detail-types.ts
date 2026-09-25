import type { VersionKind } from '../media/schema.ts';
import type { LibraryJobSummary } from './types.ts';

export interface LibraryDetailLinks {
  url: string;
  markdown: string;
  html: string;
  downloadUrl: string;
}
export interface LibraryDetailVersion {
  kind: VersionKind;
  applicable: boolean | null;
  saved: boolean;
  format: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  previewPath: string | null;
  downloadPath: string | null;
  links: LibraryDetailLinks | null;
  unavailableReason: string | null;
}
export interface LibraryDetail {
  id: string;
  displayName: string;
  originalName: string;
  format: string;
  mime: string;
  width: number | null;
  height: number | null;
  byteSize: number;
  animated: boolean | null;
  pageCount: number | null;
  classification: 'static' | 'animated' | 'preview_only' | null;
  visibility: 'public' | 'private';
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  createdAt: string;
  trashedAt: string | null;
  deletionStatus: 'deleting' | 'cleanup_failed' | null;
  storage: { id: string; name: string; enabled: boolean };
  albums: { id: string; name: string }[];
  tags: { id: string; displayName: string }[];
  versions: LibraryDetailVersion[];
  defaultVersion: VersionKind;
  defaultLink: {
    actualVersion: VersionKind | null;
    links: LibraryDetailLinks | null;
    downloadPath: string | null;
    unavailableReason: string | null;
  };
  activeJob: LibraryJobSummary | null;
  latestFailedJob: LibraryJobSummary | null;
}
