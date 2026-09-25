import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { buildImagePath } from '../delivery/links.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import type { LibraryItem, LibraryJobSummary, LibraryPage } from './types.ts';

const cursorSchema = z.strictObject({
  scope: z.literal('library'),
  sort: z.literal('uploaded_desc'),
  pageSize: z.literal(40),
  createdAt: z.number().int().min(-8640000000000000).max(8640000000000000),
  id: z.string().min(1),
});
type Cursor = z.infer<typeof cursorSchema>;
export class LibraryQueryError extends Error {
  readonly code = 'LIBRARY_INVALID_QUERY';
  readonly status = 400;
}

export function parseLibraryQuery(params: URLSearchParams): Cursor | null {
  if (
    [...params.keys()].some((key) => key !== 'cursor') ||
    params.getAll('cursor').length > 1
  )
    throw new LibraryQueryError('当前图库仅支持固定顺序加载更多，请重置查询');
  const encoded = params.get('cursor');
  if (encoded === null) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('encoding');
    return cursorSchema.parse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
    );
  } catch {
    throw new LibraryQueryError('加载位置无效，请重新加载图库');
  }
}

/** All page facts and total share a short SQLite read transaction; no file I/O. */
export function readLibraryPage(
  db: BetterSQLite3Database,
  cursor: Cursor | null = null,
): LibraryPage {
  return db.transaction((tx) => {
    const normal = and(
      isNull(mediaImages.trashedAt),
      isNull(mediaImages.deletionStatus),
    );
    const total = tx
      .select({ value: count() })
      .from(mediaImages)
      .where(normal)
      .get()!.value;
    const rows = tx
      .select({
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
        storage: {
          id: storageConfigs.id,
          name: storageConfigs.name,
          enabled: storageConfigs.enabled,
        },
      })
      .from(mediaImages)
      .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
      .where(
        and(
          normal,
          cursor
            ? or(
                lt(mediaImages.createdAt, new Date(cursor.createdAt)),
                and(
                  eq(mediaImages.createdAt, new Date(cursor.createdAt)),
                  gt(mediaImages.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(mediaImages.createdAt), asc(mediaImages.id))
      .limit(41)
      .all();
    const hasMore = rows.length > 40;
    const page = rows.slice(0, 40);
    if (!page.length)
      return { items: [], total, nextCursor: null, hasMore: false };
    const ids = page.map((row) => row.id);
    const saved = tx
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
    const ranked = tx
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
    const jobs = tx.select().from(ranked).where(eq(ranked.rank, 1)).all();
    const items: LibraryItem[] = page.map((row) => {
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
          (job) =>
            job.imageId === row.id && (job.status === 'failed') === failed,
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
        ...row,
        createdAt: row.createdAt.toISOString(),
        versions,
        thumbnailUrl:
          row.storage.enabled && versions.thumbnail
            ? buildImagePath(row.id, 'thumbnail')
            : null,
        activeJob: summary(false),
        latestFailedJob: summary(true),
        trashedAt: null,
        deletionStatus: null,
      };
    });
    const last = page.at(-1)!;
    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({
            scope: 'library',
            sort: 'uploaded_desc',
            pageSize: 40,
            createdAt: last.createdAt.getTime(),
            id: last.id,
          } satisfies Cursor),
        ).toString('base64url')
      : null;
    return { items, total, nextCursor, hasMore };
  });
}
