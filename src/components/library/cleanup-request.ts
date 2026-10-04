import type { LibraryCleanupTask } from '../../server/library/batch-types';

export class CleanupRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requestCleanup(
  imageId: string,
  operation: 'read' | 'delete' | 'retry',
  signal: AbortSignal,
): Promise<LibraryCleanupTask> {
  const base = `/api/images/${encodeURIComponent(imageId)}`;
  const response = await fetch(
    operation === 'delete'
      ? base
      : `${base}/cleanup${operation === 'retry' ? '/retry' : ''}`,
    {
      method:
        operation === 'read'
          ? 'GET'
          : operation === 'delete'
            ? 'DELETE'
            : 'POST',
      cache: 'no-store',
      signal,
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new CleanupRequestError(
      `${body.code ? `${body.code}: ` : ''}${body.message ?? '清理请求失败'}（HTTP ${response.status}）`,
      response.status,
    );
  return body as LibraryCleanupTask;
}

/** Retry acceptance belongs to a new cycle of the frozen job, never the old failure. */
export function cleanupAttemptConfirmed(
  task: LibraryCleanupTask,
  previous: { jobId: string; cycle: number } | null,
) {
  return (
    previous === null ||
    (task.jobId === previous.jobId && task.cycle === previous.cycle + 1)
  );
}
