import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { mediaImages } from '../media/schema.ts';
import { CollectionError } from './errors.ts';
import { albums, albumImages } from './schema.ts';
import type { CollectionsTransaction } from './types.ts';

const memberQuery = z.object({
  scope: z.enum(['normal', 'public']),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(20), z.literal(40), z.literal(80)]).default(40),
});

/** Internal identities only, not delivery authorization. Filter before count/pagination.
 * Call in a shared read transaction so count and rows use the same snapshot.
 */
export function readAlbumMembers(
  tx: CollectionsTransaction,
  albumId: string,
  input: z.input<typeof memberQuery>,
) {
  const parsed = memberQuery.safeParse(input);
  if (!parsed.success)
    throw new CollectionError('COLLECTION_INVALID_INPUT', parsed.error.message);
  if (
    !tx
      .select({ id: albums.id })
      .from(albums)
      .where(eq(albums.id, albumId))
      .get()
  ) {
    throw new CollectionError(
      'COLLECTION_TARGET_NOT_FOUND',
      `相册不存在: ${albumId}`,
    );
  }
  const { scope, page, pageSize } = parsed.data;
  const filter = and(
    eq(albumImages.albumId, albumId),
    isNull(mediaImages.trashedAt),
    isNull(mediaImages.deletionStatus),
    scope === 'public' ? eq(mediaImages.visibility, 'public') : undefined,
  );
  const total = tx
    .select({ value: count() })
    .from(albumImages)
    .innerJoin(mediaImages, eq(albumImages.imageId, mediaImages.id))
    .where(filter)
    .get()!.value;
  const items = tx
    .select({ image: mediaImages, joinedAt: albumImages.joinedAt })
    .from(albumImages)
    .innerJoin(mediaImages, eq(albumImages.imageId, mediaImages.id))
    .where(filter)
    .orderBy(desc(albumImages.joinedAt), asc(albumImages.imageId))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  return { items, total, page, pageSize };
}
