import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { mediaImages } from '../media/schema.ts';
import { CollectionError } from './errors.ts';
import { albums, albumImages } from './schema.ts';
import type { CollectionsTransaction } from './types.ts';

export type AlbumCoverIdentity = {
  imageId: string | null;
  mode: 'manual' | 'automatic' | 'empty';
  preferredCoverImageId: string | null;
  temporaryFallback: boolean;
};

const coverImageInput = z.string().min(1).nullable();

/** Caller owns an IMMEDIATE transaction so eligibility and choice commit together. */
export function setAlbumCover(
  tx: CollectionsTransaction,
  albumId: string,
  imageId: string | null,
) {
  const parsed = coverImageInput.safeParse(imageId);
  if (!parsed.success)
    throw new CollectionError('COLLECTION_INVALID_INPUT', '封面图片 ID 无效');
  const album = tx.select().from(albums).where(eq(albums.id, albumId)).get();
  if (!album)
    throw new CollectionError(
      'COLLECTION_TARGET_NOT_FOUND',
      `相册不存在: ${albumId}`,
    );
  if (
    imageId !== null &&
    !tx
      .select({ id: mediaImages.id })
      .from(albumImages)
      .innerJoin(mediaImages, eq(albumImages.imageId, mediaImages.id))
      .where(
        and(
          eq(albumImages.albumId, albumId),
          eq(albumImages.imageId, imageId),
          eq(mediaImages.visibility, 'public'),
          isNull(mediaImages.trashedAt),
          isNull(mediaImages.deletionStatus),
        ),
      )
      .get()
  )
    throw new CollectionError(
      'COLLECTION_IMAGE_UNAVAILABLE',
      `封面必须是当前相册中未回收、未永久删除的公开图片: ${imageId}`,
    );
  return tx
    .update(albums)
    .set({ preferredCoverImageId: imageId, updatedAt: new Date() })
    .where(eq(albums.id, albumId))
    .returning()
    .get()!;
}

/** Internal identities, not delivery authorization. Call in the shared read transaction.
 * Processing and storage state never change candidate identity; delivery handles display.
 */
export function resolveAlbumCovers(
  tx: CollectionsTransaction,
  albumIds: readonly string[],
): Map<string, AlbumCoverIdentity> {
  const ids = [...new Set(albumIds)];
  if (!ids.length) return new Map();
  const rows = tx
    .select({
      id: albums.id,
      preferredCoverImageId: albums.preferredCoverImageId,
    })
    .from(albums)
    .where(inArray(albums.id, ids))
    .all();
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length)
    throw new CollectionError(
      'COLLECTION_TARGET_NOT_FOUND',
      `相册不存在: ${missing.join(', ')}`,
    );
  const ranked = tx
    .select({
      albumId: albumImages.albumId,
      imageId: albumImages.imageId,
      rank: sql<number>`row_number() over (
        partition by ${albumImages.albumId}
        order by case when ${albumImages.imageId} = ${albums.preferredCoverImageId} then 0 else 1 end,
          ${desc(albumImages.joinedAt)}, ${asc(albumImages.imageId)}
      )`.as('cover_rank'),
    })
    .from(albumImages)
    .innerJoin(albums, eq(albumImages.albumId, albums.id))
    .innerJoin(mediaImages, eq(albumImages.imageId, mediaImages.id))
    .where(
      and(
        inArray(albumImages.albumId, ids),
        eq(mediaImages.visibility, 'public'),
        isNull(mediaImages.trashedAt),
        isNull(mediaImages.deletionStatus),
      ),
    )
    .as('ranked_covers');
  const candidates = new Map(
    tx
      .select({ albumId: ranked.albumId, imageId: ranked.imageId })
      .from(ranked)
      .where(eq(ranked.rank, 1))
      .all()
      .map((row) => [row.albumId, row.imageId]),
  );
  return new Map(
    rows.map(({ id, preferredCoverImageId }) => {
      const imageId = candidates.get(id) ?? null;
      const manual = imageId !== null && imageId === preferredCoverImageId;
      return [
        id,
        {
          imageId,
          mode: imageId === null ? 'empty' : manual ? 'manual' : 'automatic',
          preferredCoverImageId,
          temporaryFallback: preferredCoverImageId !== null && !manual,
        },
      ];
    }),
  );
}

export function resolveAlbumCover(tx: CollectionsTransaction, albumId: string) {
  return resolveAlbumCovers(tx, [albumId]).get(albumId)!;
}
