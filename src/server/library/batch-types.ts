import type { readMediaCleanup } from '../media/cleanup.ts';
import type { LibraryProcessingJob } from './types.ts';

type MediaCleanup = ReturnType<typeof readMediaCleanup>;
export type LibraryCleanupTask = Omit<
  MediaCleanup,
  'finishedAt' | 'remaining'
> & {
  finishedAt: string | null;
  remaining: (Omit<MediaCleanup['remaining'][number], 'nextAttemptAt'> & {
    nextAttemptAt: string | null;
  })[];
};

export type CleanupCommand =
  | { type: 'delete-permanent' }
  | {
      type: 'retry-cleanup';
      attempts: Record<string, { taskId: string; cycle: number }>;
    };

export type BatchCommand =
  | { type: 'add-albums' | 'remove-albums'; albumIds: string[] }
  | { type: 'add-tags' | 'remove-tags'; tagIds: string[] }
  | { type: 'visibility'; visibility: 'public' | 'private' }
  | { type: 'trash' | 'restore' }
  | CleanupCommand
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
  | {
      status: 'accepted';
      taskId: string;
      task: LibraryProcessingJob;
      cleanup?: never;
    }
  | {
      status: 'accepted' | 'unchanged';
      taskId: string;
      cleanup: LibraryCleanupTask;
      task?: never;
    }
  | {
      status: 'changed' | 'unchanged' | 'failed' | 'unknown';
      taskId?: never;
      task?: never;
      cleanup?: never;
    }
);

export interface LibraryBatchResponse {
  results: BatchItemResult[];
}
