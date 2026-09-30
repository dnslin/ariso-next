export interface LibraryJobSummary {
  id: string;
  status: 'queued' | 'running' | 'failed';
  scope: 'all' | 'compressed' | 'thumbnail' | 'watermark';
  step: string;
  error: string | null;
}

export interface LibraryItem {
  id: string;
  displayName: string;
  originalName: string;
  byteSize: number;
  format: string;
  width: number | null;
  height: number | null;
  visibility: 'public' | 'private';
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  createdAt: string;
  storage: { id: string; name: string; enabled: boolean };
  versions: Record<
    'original' | 'compressed' | 'thumbnail' | 'watermark',
    boolean
  >;
  thumbnailUrl: string | null;
  thumbnailDimensions: { width: number; height: number } | null;
  activeJob: LibraryJobSummary | null;
  latestFailedJob: LibraryJobSummary | null;
  trashedAt: string | null;
  deletionStatus: 'deleting' | 'cleanup_failed' | null;
}

export interface LibraryPage {
  page?: number;
  pageSize?: 20 | 40 | 80;
  items: LibraryItem[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}
