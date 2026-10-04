import type {
  BatchItemResult,
  CleanupCommand,
  LibraryCleanupTask,
} from '../../server/library/batch-types';
import type { BatchSnapshotItem } from './use-library-batch';

type CleanupResult = Extract<BatchItemResult, { cleanup: LibraryCleanupTask }>;
type UnconfirmedResult = Exclude<BatchItemResult, CleanupResult>;

export type TrashBatchRow = {
  id: string;
  command: CleanupCommand;
} & (
  | { state: 'unsent' | 'waiting'; result?: never }
  | { state: 'unknown'; result?: UnconfirmedResult }
  | { state: 'rejected'; result: BatchItemResult & { status: 'failed' } }
  | { state: 'task'; result: CleanupResult }
);
export interface TrashBatchWorkspace {
  items: BatchSnapshotItem[];
  currentCount: number;
  query: string;
  rows: TrashBatchRow[];
  phase: 'confirm' | 'result';
  message: string;
}

export function cleanupCommandFor(rows: TrashBatchRow[]): CleanupCommand {
  if (rows[0]?.command.type !== 'retry-cleanup')
    return { type: 'delete-permanent' };
  return {
    type: 'retry-cleanup',
    attempts: Object.fromEntries(
      rows.map((row) => {
        if (row.command.type !== 'retry-cleanup')
          throw new Error('清理重试不能混入首次永久删除');
        return [row.id, row.command.attempts[row.id]];
      }),
    ),
  };
}

export function recordCleanupResults(
  rows: TrashBatchRow[],
  results: BatchItemResult[],
): TrashBatchRow[] {
  const byId = new Map(results.map((result) => [result.id, result]));
  return rows.map((row) => {
    const result = byId.get(row.id);
    if (!result) return row;
    if (result.cleanup)
      return { id: row.id, command: row.command, state: 'task', result };
    return result.status === 'failed'
      ? {
          id: row.id,
          command: row.command,
          state: 'rejected',
          result: { ...result, status: 'failed' },
        }
      : { id: row.id, command: row.command, state: 'unknown', result };
  });
}

/** A retry keeps its previous cycle until a newer cycle is observed. */
export function retryCleanupRow(row: TrashBatchRow): TrashBatchRow {
  if (row.state !== 'task' || row.result.cleanup.status !== 'failed')
    return row;
  return {
    id: row.id,
    command: {
      type: 'retry-cleanup',
      attempts: {
        [row.id]: {
          taskId: row.result.cleanup.jobId,
          cycle: row.result.cleanup.cycle,
        },
      },
    },
    state: 'unsent',
  };
}
