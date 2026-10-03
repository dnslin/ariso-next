import type { VersionKind } from '../media/schema.ts';
import type {
  LibraryJobSummary,
  LibraryMetadataJob,
  LibraryProcessingJob,
} from './types.ts';
import type {
  GroupedMetadata,
  PhotographyFields,
} from '../media/metadata-values.ts';

export interface LibraryMetadata {
  imageId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  data: GroupedMetadata | null;
  photography: PhotographyFields | null;
  readAt: string | null;
  attemptedAt: string | null;
  error: string | null;
  historical: boolean;
}

export interface LibraryDetailLinks {
  url: string;
  markdown: string;
  html: string;
  downloadUrl: string;
}
export interface LibraryDetailVersion {
  kind: VersionKind;
  /** Identity of the published bytes; stable delivery paths can be replaced. */
  contentId: string | null;
  applicable: boolean | null;
  saved: boolean;
  status: 'saved' | 'not_applicable' | 'disabled' | 'failed' | 'not_generated';
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
  metadataJob: LibraryMetadataJob | null;
  processingJob: LibraryProcessingJob | null;
  reprocess: {
    scopes: Record<
      'all' | 'compressed' | 'thumbnail' | 'watermark',
      string | null
    >;
    expectedVersions: ('compressed' | 'thumbnail' | 'watermark')[];
    compressionEnabled: boolean;
    watermarkEnabled: boolean;
  };
  actions: {
    editUnavailableReason: string | null;
    reprocessUnavailableReason: string | null;
    metadataReadUnavailableReason: string | null;
  };
}
