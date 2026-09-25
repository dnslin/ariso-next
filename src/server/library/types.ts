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
  activeJob: LibraryJobSummary | null;
  latestFailedJob: LibraryJobSummary | null;
  trashedAt: null;
  deletionStatus: null;
}

export interface LibraryPage {
  items: LibraryItem[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}
