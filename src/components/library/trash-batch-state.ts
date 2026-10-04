import type {
  BatchItemResult,
  CleanupCommand,
  LibraryCleanupTask,
} from '../../server/library/batch-types';
import type { BatchSnapshotItem } from './use-library-batch';

export interface TrashBatchRow {
  id: string;
  command: CleanupCommand;
  state: 'unsent' | 'waiting' | 'unknown' | 'rejected' | 'task';
  result?: BatchItemResult;
  cleanup?: LibraryCleanupTask;
}
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
      return { ...row, state: 'task', result, cleanup: result.cleanup };
    return {
      ...row,
      state: result.status === 'failed' ? 'rejected' : 'unknown',
      result,
      cleanup: undefined,
    };
  });
}

/** A retry keeps its previous cycle until a newer cycle is observed. */
export function retryCleanupRow(row: TrashBatchRow): TrashBatchRow {
  if (row.state !== 'task' || row.cleanup?.status !== 'failed') return row;
  return {
    ...row,
    command: {
      type: 'retry-cleanup',
      attempts: {
        [row.id]: { taskId: row.cleanup.jobId, cycle: row.cleanup.cycle },
      },
    },
    state: 'unsent',
    result: undefined,
    cleanup: undefined,
  };
}
