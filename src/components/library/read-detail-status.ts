import type { LibraryDetail } from '../../server/library/detail-types';
import type {
  LibraryItem,
  LibraryMetadataJob,
  LibraryProcessingJob,
  LibraryJobSummary,
} from '../../server/library/types';
import { DetailReadError } from './read-detail';

export async function readDetailStatus(
  imageId: string,
  signal: AbortSignal,
): Promise<{ items: LibraryItem[]; missingIds: string[] }> {
  const response = await fetch('/api/images/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [imageId] }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    const result = await response.json();
    throw new DetailReadError(
      `${result.message}（HTTP ${response.status}）`,
      response.status,
    );
  }
  return response.json();
}

export function hasActiveDetailTask(
  record: Pick<LibraryItem, 'activeJob' | 'metadataJob'>,
) {
  return (
    !!record.activeJob ||
    record.metadataJob?.status === 'queued' ||
    record.metadataJob?.status === 'running'
  );
}

function taskSignature(
  job: LibraryMetadataJob | LibraryProcessingJob | LibraryJobSummary | null,
) {
  return job
    ? JSON.stringify([
        job.id,
        job.status,
        job.step,
        job.error,
        'scope' in job ? job.scope : null,
        'expectedVersions' in job ? job.expectedVersions : null,
        'generatedVersions' in job ? job.generatedVersions : null,
      ])
    : null;
}

export function detailStatusChanged(
  detail: LibraryDetail,
  item: LibraryItem | undefined,
) {
  if (!item) return true;
  return (
    detail.processingStatus !== item.processingStatus ||
    detail.trashedAt !== item.trashedAt ||
    detail.deletionStatus !== item.deletionStatus ||
    detail.storage.enabled !== item.storage.enabled ||
    taskSignature(detail.activeJob) !== taskSignature(item.activeJob) ||
    taskSignature(detail.latestFailedJob) !==
      taskSignature(item.latestFailedJob) ||
    taskSignature(detail.metadataJob) !== taskSignature(item.metadataJob) ||
    taskSignature(detail.processingJob) !== taskSignature(item.processingJob) ||
    detail.versions.some(
      (version) => version.saved !== item.versions[version.kind],
    )
  );
}
