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
} from 'drizzle-orm';
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

function publicAlbumMembers(tx: CollectionsTransaction, albumId: string) {
  return tx
    .select({ imageId: albumImages.imageId, joinedAt: albumImages.joinedAt })
    .from(albumImages)
    .innerJoin(mediaImages, eq(albumImages.imageId, mediaImages.id))
    .where(
      and(
        eq(albumImages.albumId, albumId),
        eq(mediaImages.visibility, 'public'),
        isNull(mediaImages.trashedAt),
        isNull(mediaImages.deletionStatus),
      ),
    );
}

/** Public identities are filtered before both counting and pagination. */
export function countPublicAlbumMembers(
  tx: CollectionsTransaction,
  albumId: string,
) {
  const members = publicAlbumMembers(tx, albumId).as('public_members');
  return tx.select({ value: count() }).from(members).get()!.value;
}

/** The cursor exposes only an ID; its current joinedAt is resolved in the page query. */
export function readPublicAlbumPage(
  tx: CollectionsTransaction,
  albumId: string,
  cursor: string | null,
) {
  const members = publicAlbumMembers(tx, albumId).as('public_members');
  const anchor = tx
    .select({ imageId: members.imageId, joinedAt: members.joinedAt })
    .from(members)
    .where(eq(members.imageId, cursor ?? ''))
    .as('public_anchor');
  const rows =
    cursor === null
      ? tx
          .select({ imageId: members.imageId })
          .from(members)
          .orderBy(desc(members.joinedAt), asc(members.imageId))
          .limit(41)
          .all()
      : tx
          .select({ imageId: members.imageId })
          .from(anchor)
          .leftJoin(
            members,
            or(
              lt(members.joinedAt, anchor.joinedAt),
              and(
                eq(members.joinedAt, anchor.joinedAt),
                gt(members.imageId, anchor.imageId),
              ),
            ),
          )
          .orderBy(desc(members.joinedAt), asc(members.imageId))
          .limit(41)
          .all();
  if (cursor !== null && rows.length === 0)
    throw new CollectionError(
      'COLLECTION_CURSOR_INVALID',
      '加载位置已失效，请刷新相册',
    );
  const ids = rows.flatMap((row) =>
    row.imageId === null ? [] : [row.imageId],
  );
  const imageIds = ids.slice(0, 40);
  const hasMore = ids.length > 40;
  return {
    imageIds,
    hasMore,
    nextCursor: hasMore ? imageIds.at(-1)! : null,
  };
}

/** Explicit IDs stay inside the same current public collection, including refresh reads. */
export function readPublicAlbumIds(
  tx: CollectionsTransaction,
  albumId: string,
  ids: readonly string[],
) {
  if (!ids.length) return [];
  const members = publicAlbumMembers(tx, albumId).as('public_members');
  return tx
    .select({ imageId: members.imageId })
    .from(members)
    .where(inArray(members.imageId, [...ids]))
    .all()
    .map((row) => row.imageId);
}
