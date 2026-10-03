import type { BatchItemResult } from '../../server/library/batch-types';
import type { LibraryProcessingJob } from '../../server/library/types';
import type { BatchSnapshotItem } from './use-library-batch';

export type ReprocessScope = LibraryProcessingJob['scope'];
export type ReprocessAccepted = Extract<
  BatchItemResult,
  { status: 'accepted' }
>;
export type ReprocessRejected = BatchItemResult & { status: 'failed' };
export type ReprocessState =
  | 'unsent'
  | 'waiting'
  | 'unknown'
  | 'rejected'
  | LibraryProcessingJob['status'];
export interface ReprocessRow {
  id: string;
  attempt: { readonly taskId: string; readonly scope: ReprocessScope };
  outcome:
    | { state: 'unsent' | 'waiting' | 'unknown' }
    | { state: 'rejected'; result: ReprocessRejected }
    | { state: 'accepted'; result: ReprocessAccepted };
}
export interface ReprocessWorkspace {
  action: 'reprocess';
  items: BatchSnapshotItem[];
  currentCount: number;
  query: string;
  scope: ReprocessScope;
  rows: ReprocessRow[];
  message: string;
  phase: 'choose' | 'result';
}
export const reprocessScopes: ReprocessScope[] = [
  'all',
  'compressed',
  'thumbnail',
  'watermark',
];
export function rowState(row: ReprocessRow): ReprocessState {
  return row.outcome.state === 'accepted'
    ? row.outcome.result.task.status
    : row.outcome.state;
}
export function failedTaskIds(rows: ReprocessRow[], scope: ReprocessScope) {
  return rows
    .filter(
      (row) =>
        row.attempt.scope === scope &&
        row.outcome.state === 'accepted' &&
        row.outcome.result.inQuery &&
        (row.outcome.result.task.status === 'failed' ||
          row.outcome.result.task.status === 'cancelled'),
    )
    .map((row) => row.id);
}
