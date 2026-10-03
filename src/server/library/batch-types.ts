export type BatchCommand =
  | { type: 'add-albums' | 'remove-albums'; albumIds: string[] }
  | { type: 'add-tags' | 'remove-tags'; tagIds: string[] }
  | { type: 'visibility'; visibility: 'public' | 'private' }
  | { type: 'trash' | 'restore' };

export interface LibraryBatchRequest {
  ids: string[];
  query: string;
  command: BatchCommand;
  mode: 'apply' | 'check';
}

export interface BatchItemResult {
  id: string;
  status: 'changed' | 'unchanged' | 'failed';
  message: string;
  code?: string;
  inQuery: boolean;
}

export interface LibraryBatchResponse {
  results: BatchItemResult[];
}
