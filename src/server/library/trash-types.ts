export interface TrashItem {
  thumbnailPath: string | null;
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
