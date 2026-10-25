import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages, mediaObjects, mediaVersions } from './schema.ts';

/** Only the published original identifies an image; replacement candidates and retired objects do not. */
export function findDuplicateImage(db: BetterSQLite3Database, sha256: string) {
  return db
    .select({ id: mediaImages.id, trashedAt: mediaImages.trashedAt })
    .from(mediaObjects)
    .innerJoin(
      mediaVersions,
      and(
        eq(mediaVersions.objectId, mediaObjects.id),
        eq(mediaVersions.kind, 'original'),
      ),
    )
    .innerJoin(mediaImages, eq(mediaImages.id, mediaVersions.imageId))
    .where(
      and(
        eq(mediaObjects.contentSha256, sha256),
        eq(mediaObjects.status, 'stored'),
        isNull(mediaImages.deletionStatus),
      ),
    )
    .orderBy(
      asc(sql`case when ${mediaImages.trashedAt} is null then 0 else 1 end`),
      asc(mediaImages.createdAt),
      asc(mediaImages.id),
    )
    .get();
}
