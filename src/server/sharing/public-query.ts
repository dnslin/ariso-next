import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { resolveAlbumCover } from '../collections/cover.ts';
import { CollectionError } from '../collections/errors.ts';
import {
  countPublicAlbumMembers,
  readPublicAlbumIds,
  readPublicAlbumNeighbors,
  readPublicAlbumPage,
} from '../collections/queries.ts';
import { albums } from '../collections/schema.ts';
import { readAnonymousThumbnails } from '../delivery/thumbnails.ts';
import { readShareAccess } from './authorization.ts';
import { SharingError } from './errors.ts';
import type {
  PublicShareAlbum,
  PublicShareNeighbors,
  PublicSharePage,
  PublicShareRefresh,
} from './public-types.ts';
import type { SharingTransaction } from './types.ts';
import {
  parsePublicShareCursor,
  parsePublicShareQuery,
  publicRefreshInputSchema,
} from './validation.ts';

export interface PublicShareAccess {
  token: string;
  grantSecret?: string;
  now?: Date;
}

function requirePublicShare(tx: SharingTransaction, input: PublicShareAccess) {
  const access = readShareAccess(tx, {
    ...input,
    now: input.now ?? new Date(),
  });
  if (!access.allowed)
    throw new SharingError(
      access.status === 401
        ? 'SHARING_PASSWORD_REQUIRED'
        : access.status === 404
          ? 'SHARING_NOT_FOUND'
          : 'SHARING_UNAVAILABLE',
      access.status === 401 ? '请输入分享密码' : '分享不存在或已失效',
      access.status,
    );
  return access.share;
}

function readPublicAlbum(
  tx: SharingTransaction,
  share: ReturnType<typeof requirePublicShare>,
): PublicShareAlbum {
  const album = tx
    .select({ name: albums.name, description: albums.description })
    .from(albums)
    .where(eq(albums.id, share.albumId))
    .get()!;
  const cover = resolveAlbumCover(tx, share.albumId);
  return {
    albumName: album.name,
    description: album.description,
    layout: share.layout,
    showName: share.showName,
    total: countPublicAlbumMembers(tx, share.albumId),
    cover:
      cover.imageId === null
        ? null
        : readAnonymousThumbnails(tx, [cover.imageId], share.showName)[0],
  };
}

function readPublicPage(
  tx: SharingTransaction,
  share: ReturnType<typeof requirePublicShare>,
  cursor: string | null,
): PublicSharePage {
  try {
    const page = readPublicAlbumPage(tx, share.albumId, cursor);
    return {
      ...readPublicAlbum(tx, share),
      items: readAnonymousThumbnails(tx, page.imageIds, share.showName),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  } catch (err) {
    if (
      err instanceof CollectionError &&
      err.code === 'COLLECTION_CURSOR_INVALID'
    )
      throw new SharingError('SHARING_CURSOR_INVALID', err.message, 409);
    throw err;
  }
}

/** HTML reads validate their ID anchor after authorization in one short snapshot. */
export function readPublicSharePage(
  db: BetterSQLite3Database,
  input: PublicShareAccess,
  cursor: string | null = null,
): PublicSharePage {
  return db.transaction((tx) => {
    const share = requirePublicShare(tx, input);
    return readPublicPage(tx, share, parsePublicShareCursor(cursor));
  });
}

/** The JSON query's transport validation cannot precede the same share authorization. */
export function readPublicShareItems(
  db: BetterSQLite3Database,
  input: PublicShareAccess,
  params: URLSearchParams,
): PublicSharePage | PublicShareNeighbors {
  return db.transaction((tx) => {
    const share = requirePublicShare(tx, input);
    const query = parsePublicShareQuery(params);
    if (query.kind === 'page') return readPublicPage(tx, share, query.cursor);
    const neighborhood = readPublicAlbumNeighbors(
      tx,
      share.albumId,
      query.imageId,
    );
    const ids = [
      neighborhood.current,
      neighborhood.previous,
      neighborhood.next,
    ].filter((id): id is string => id !== null);
    const items = new Map(
      readAnonymousThumbnails(tx, ids, share.showName).map((item) => [
        item.imageId,
        item,
      ]),
    );
    return {
      current:
        neighborhood.current === null ? null : items.get(neighborhood.current)!,
      previous:
        neighborhood.previous === null
          ? null
          : items.get(neighborhood.previous)!,
      next: neighborhood.next === null ? null : items.get(neighborhood.next)!,
      showName: share.showName,
      total: neighborhood.total,
      position: neighborhood.position,
    };
  });
}

/** Unknown, moved, private, trashed and deleting IDs all disappear from the same set. */
export function refreshPublicShare(
  db: BetterSQLite3Database,
  input: PublicShareAccess,
  body: unknown,
): PublicShareRefresh {
  return db.transaction((tx) => {
    const share = requirePublicShare(tx, input);
    const parsed = publicRefreshInputSchema.safeParse(body);
    if (!parsed.success)
      throw new SharingError(
        'SHARING_INVALID_INPUT',
        '状态检查需要最多 80 个非空图片 ID',
      );
    const publicIds = new Set(
      readPublicAlbumIds(tx, share.albumId, parsed.data.ids),
    );
    return {
      ...readPublicAlbum(tx, share),
      items: readAnonymousThumbnails(
        tx,
        parsed.data.ids.filter((id) => publicIds.has(id)),
        share.showName,
      ),
    };
  });
}
