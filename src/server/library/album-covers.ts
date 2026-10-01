import { eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  listAlbums,
  readAlbum,
  type parseAlbumQuery,
} from '../collections/album-management.ts';
import type { CollectionsTransaction } from '../collections/types.ts';
import { mediaImages } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { libraryColumns, readLibraryItems } from './query-items.ts';

type AlbumRecord = ReturnType<typeof readAlbum>;

/** Owner presentation composes collection identities with saved delivery thumbnails. */
function presentAlbums(db: BetterSQLite3Database, records: AlbumRecord[]) {
  const ids = [
    ...new Set(
      records.flatMap((album) =>
        album.cover.imageId ? [album.cover.imageId] : [],
      ),
    ),
  ];
  const rows = ids.length
    ? db
        .select(libraryColumns)
        .from(mediaImages)
        .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
        .where(inArray(mediaImages.id, ids))
        .all()
    : [];
  const items = new Map(
    readLibraryItems(db, rows).map((item) => [item.id, item]),
  );
  return records.map((album) => {
    const item = album.cover.imageId
      ? items.get(album.cover.imageId)
      : undefined;
    const status = !item
      ? ('empty' as const)
      : item.processingStatus === 'pending' ||
          item.processingStatus === 'processing'
        ? ('processing' as const)
        : item.processingStatus === 'failed'
          ? ('failed' as const)
          : !item.storage.enabled
            ? ('disabled' as const)
            : !item.thumbnailUrl
              ? ('missing' as const)
              : ('ready' as const);
    return {
      ...album,
      cover: {
        ...album.cover,
        displayName: item?.displayName ?? null,
        status,
        thumbnailUrl: status === 'ready' ? item!.thumbnailUrl : null,
      },
    };
  });
}

export function listOwnerAlbums(
  db: BetterSQLite3Database,
  query: ReturnType<typeof parseAlbumQuery>,
) {
  return db.transaction((tx) => {
    const result = listAlbums(tx, query);
    return { ...result, items: presentAlbums(tx, result.items) };
  });
}

export function readOwnerAlbum(db: CollectionsTransaction, id: string) {
  return presentAlbums(db, [readAlbum(db, id)])[0];
}
