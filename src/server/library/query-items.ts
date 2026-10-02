import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { buildImagePath, buildTrashPreviewPath } from '../delivery/links.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { readGeneratedMediaVersions } from '../media/objects.ts';
import type { LibraryItem, LibraryJobSummary } from './types.ts';

export const libraryColumns = {
  id: mediaImages.id,
  displayName: mediaImages.displayName,
  originalName: mediaImages.originalName,
  byteSize: mediaImages.byteSize,
  format: mediaImages.format,
  width: mediaImages.width,
  height: mediaImages.height,
  visibility: mediaImages.visibility,
  processingStatus: mediaImages.processingStatus,
  createdAt: mediaImages.createdAt,
  trashedAt: mediaImages.trashedAt,
  deletionStatus: mediaImages.deletionStatus,
  storage: {
    id: storageConfigs.id,
    name: storageConfigs.name,
    enabled: storageConfigs.enabled,
  },
};
type LibraryRow = Omit<
  LibraryItem,
  | 'createdAt'
  | 'trashedAt'
  | 'versions'
  | 'thumbnailUrl'
  | 'thumbnailDimensions'
  | 'activeJob'
  | 'latestFailedJob'
  | 'metadataJob'
  | 'processingJob'
> & { createdAt: Date; trashedAt: Date | null };

/** Batch reads for saved versions, jobs and generated results, independent of page length. */
export function readLibraryItems(
  db: BetterSQLite3Database,
  rows: LibraryRow[],
): LibraryItem[] {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const saved = db
    .select({
      imageId: mediaVersions.imageId,
      kind: mediaVersions.kind,
      width: mediaVersions.width,
      height: mediaVersions.height,
    })
    .from(mediaVersions)
    .innerJoin(mediaObjects, eq(mediaVersions.objectId, mediaObjects.id))
    .where(
      and(
        inArray(mediaVersions.imageId, ids),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .all();
  // One batch returns active/failed process summaries plus each kind's latest job, including terminal states.
  const ranked = db
    .select({
      imageId: mediaJobs.imageId,
      id: mediaJobs.id,
      kind: mediaJobs.kind,
      status: mediaJobs.status,
      scope: mediaJobs.scope,
      expectedVersions: mediaJobs.expectedVersions,
      step: mediaJobs.step,
      error: mediaJobs.error,
      rank: sql<number>`row_number() over (partition by ${mediaJobs.imageId}, ${mediaJobs.kind}, (case when ${mediaJobs.status} = 'failed' then 1 when ${mediaJobs.status} in ('queued', 'running') then 0 else 2 end) order by ${mediaJobs.createdAt} desc, ${mediaJobs}.rowid desc)`.as(
        'job_rank',
      ),
      latestRank:
        sql<number>`row_number() over (partition by ${mediaJobs.imageId}, ${mediaJobs.kind} order by ${mediaJobs.createdAt} desc, ${mediaJobs}.rowid desc)`.as(
          'latest_rank',
        ),
    })
    .from(mediaJobs)
    .where(
      and(
        inArray(mediaJobs.imageId, ids),
        inArray(mediaJobs.kind, ['process', 'metadata']),
      ),
    )
    .as('ranked_jobs');
  const jobs = db
    .select()
    .from(ranked)
    .where(
      or(
        eq(ranked.latestRank, 1),
        and(
          eq(ranked.kind, 'process'),
          inArray(ranked.status, ['queued', 'running', 'failed']),
          eq(ranked.rank, 1),
        ),
      ),
    )
    .all();
  const generated = readGeneratedMediaVersions(
    db,
    jobs.filter((job) => job.kind === 'process' && job.latestRank === 1),
  );
  return rows.map((row) => {
    const versions = {
      original: false,
      compressed: false,
      thumbnail: false,
      watermark: false,
    };
    let thumbnailDimensions: LibraryItem['thumbnailDimensions'] = null;
    for (const version of saved) {
      if (version.imageId !== row.id) continue;
      versions[version.kind] = true;
      if (
        version.kind === 'thumbnail' &&
        version.width !== null &&
        version.height !== null
      ) {
        thumbnailDimensions = { width: version.width, height: version.height };
      }
    }
    const summary = (failed: boolean): LibraryJobSummary | null => {
      const job = jobs.find(
        (job) =>
          job.imageId === row.id &&
          job.kind === 'process' &&
          (failed
            ? job.status === 'failed'
            : job.status === 'queued' || job.status === 'running'),
      );
      return job
        ? {
            id: job.id,
            status: job.status as LibraryJobSummary['status'],
            scope: job.scope,
            step: job.step,
            error: job.error,
          }
        : null;
    };
    const metadata = jobs.find(
      (job) =>
        job.imageId === row.id &&
        job.kind === 'metadata' &&
        job.latestRank === 1,
    );
    const processing = jobs.find(
      (job) =>
        job.imageId === row.id &&
        job.kind === 'process' &&
        job.latestRank === 1,
    );
    return {
      id: row.id,
      displayName: row.displayName,
      originalName: row.originalName,
      byteSize: row.byteSize,
      format: row.format,
      width: row.width,
      height: row.height,
      visibility: row.visibility,
      processingStatus: row.processingStatus,
      storage: row.storage,
      createdAt: row.createdAt.toISOString(),
      versions,
      thumbnailDimensions,
      thumbnailUrl:
        row.storage.enabled && !row.deletionStatus && versions.thumbnail
          ? row.trashedAt
            ? buildTrashPreviewPath(row.id, 'thumbnail')
            : buildImagePath(row.id, 'thumbnail')
          : null,
      activeJob: summary(false),
      latestFailedJob: summary(true),
      processingJob: processing
        ? {
            id: processing.id,
            status: processing.status,
            scope: processing.scope,
            expectedVersions: processing.expectedVersions,
            generatedVersions: generated.get(processing.id)!,
            step: processing.step,
            error: processing.error,
          }
        : null,
      metadataJob: metadata
        ? {
            id: metadata.id,
            status: metadata.status,
            step: metadata.step,
            error: metadata.error,
          }
        : null,
      trashedAt: row.trashedAt?.toISOString() ?? null,
      deletionStatus: row.deletionStatus,
    };
  });
}
