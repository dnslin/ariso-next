import type { LibraryProcessingJob } from '../../server/library/types';
import { DetailReadError } from './read-detail';

export type ReprocessScope = LibraryProcessingJob['scope'];
export type ReprocessReceipt = Pick<
  LibraryProcessingJob,
  'scope' | 'expectedVersions'
> & { jobId: string; status: 'queued' };

export async function requestDetailReprocess(
  imageId: string,
  scope: ReprocessScope,
  signal: AbortSignal,
): Promise<ReprocessReceipt> {
  const response = await fetch(
    `/api/images/${encodeURIComponent(imageId)}/reprocess`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope }),
      cache: 'no-store',
      signal,
    },
  );
  if (!response.ok) {
    const result = await response.json();
    throw new DetailReadError(
      `${result.message}（HTTP ${response.status}）`,
      response.status,
    );
  }
  return response.json();
}
