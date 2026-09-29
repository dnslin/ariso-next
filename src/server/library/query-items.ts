import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { buildImagePath, buildTrashPreviewPath } from '../delivery/links.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
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
  | 'activeJob'
  | 'latestFailedJob'
> & { createdAt: Date; trashedAt: Date | null };

/** Two batch reads for saved versions and current/latest failed jobs, independent of page length. */
export function readLibraryItems(
  db: BetterSQLite3Database,
  rows: LibraryRow[],
): LibraryItem[] {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const saved = db
    .select({ imageId: mediaVersions.imageId, kind: mediaVersions.kind })
    .from(mediaVersions)
    .innerJoin(mediaObjects, eq(mediaVersions.objectId, mediaObjects.id))
    .where(
      and(
        inArray(mediaVersions.imageId, ids),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .all();
  // Rank within each page image and active/failed group, returning at most two summaries per image.
  const ranked = db
    .select({
      imageId: mediaJobs.imageId,
      id: mediaJobs.id,
      status: mediaJobs.status,
      scope: mediaJobs.scope,
      step: mediaJobs.step,
      error: mediaJobs.error,
      rank: sql<number>`row_number() over (partition by ${mediaJobs.imageId}, (${mediaJobs.status} = 'failed') order by ${mediaJobs.createdAt} desc, ${mediaJobs}.rowid desc)`.as(
        'job_rank',
      ),
    })
    .from(mediaJobs)
    .where(
      and(
        inArray(mediaJobs.imageId, ids),
        inArray(mediaJobs.status, ['queued', 'running', 'failed']),
      ),
    )
    .as('ranked_jobs');
  const jobs = db.select().from(ranked).where(eq(ranked.rank, 1)).all();
  return rows.map((row) => {
    const versions = {
      original: false,
      compressed: false,
      thumbnail: false,
      watermark: false,
    };
    for (const version of saved)
      if (version.imageId === row.id) versions[version.kind] = true;
    const summary = (failed: boolean): LibraryJobSummary | null => {
      const job = jobs.find(
        (job) => job.imageId === row.id && (job.status === 'failed') === failed,
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
      thumbnailUrl:
        row.storage.enabled && !row.deletionStatus && versions.thumbnail
          ? row.trashedAt
            ? buildTrashPreviewPath(row.id, 'thumbnail')
            : buildImagePath(row.id, 'thumbnail')
          : null,
      activeJob: summary(false),
      latestFailedJob: summary(true),
      trashedAt: row.trashedAt?.toISOString() ?? null,
      deletionStatus: row.deletionStatus,
    };
  });
}
