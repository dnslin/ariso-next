import { and, eq, sql, type SQL } from 'drizzle-orm';
import { mediaImages, mediaJobs } from './schema.ts';

/** Current failures, not all failed attempts; callers own normal/trash scope. */
export function mediaProcessingFailure(
  failure: 'initial' | 'reprocess',
  latestProcessStatus?: SQL,
) {
  if (failure === 'initial') return eq(mediaImages.processingStatus, 'failed');
  // The optional projection lets usage retain its batched latest-job join.
  const latest =
    latestProcessStatus ??
    sql`(select ${mediaJobs.status} from ${mediaJobs}
    where ${mediaJobs.imageId} = ${mediaImages.id} and ${mediaJobs.kind} = 'process'
    order by ${mediaJobs.createdAt} desc, ${mediaJobs}.rowid desc limit 1)`;
  return and(eq(mediaImages.processingStatus, 'ready'), eq(latest, 'failed'))!;
}
