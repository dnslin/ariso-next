import type { LibraryProcessingJob } from './types.ts';

export type BatchCommand =
  | { type: 'add-albums' | 'remove-albums'; albumIds: string[] }
  | { type: 'add-tags' | 'remove-tags'; tagIds: string[] }
  | { type: 'visibility'; visibility: 'public' | 'private' }
  | { type: 'trash' | 'restore' }
  | {
      type: 'reprocess';
      scope: LibraryProcessingJob['scope'];
      taskIds: Record<string, string>;
    };

export interface LibraryBatchRequest {
  ids: string[];
  query: string;
  command: BatchCommand;
  mode: 'apply' | 'check';
}

export type BatchItemResult = {
  id: string;
  message: string;
  code?: string;
  inQuery: boolean;
} & (
  | { status: 'accepted'; taskId: string; task: LibraryProcessingJob }
  | {
      status: 'changed' | 'unchanged' | 'failed' | 'unknown';
      taskId?: never;
      task?: never;
    }
);

export interface LibraryBatchResponse {
  results: BatchItemResult[];
}
