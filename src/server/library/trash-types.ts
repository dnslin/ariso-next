export interface TrashItem {
  id: string;
  displayName: string;
  originalName: string;
  byteSize: number;
  format: string;
  visibility: 'public' | 'private';
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  trashedAt: string;
  deletionStatus: 'deleting' | 'cleanup_failed' | null;
  storage: { id: string; name: string; enabled: boolean };
}

export interface TrashPage {
  items: TrashItem[];
  total: number;
  page: number;
  pageSize: 40;
  hasMore: boolean;
}
