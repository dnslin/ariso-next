import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  listAlbums,
  readAlbum,
  type parseAlbumQuery,
} from '../collections/album-management.ts';
import type { CollectionsTransaction } from '../collections/types.ts';
import { readCoverThumbnails } from '../delivery/cover-thumbnails.ts';

type AlbumRecord = ReturnType<typeof readAlbum>;

/** Owner presentation composes collection identities with saved delivery thumbnails. */
function presentAlbums(db: BetterSQLite3Database, records: AlbumRecord[]) {
  const thumbnails = readCoverThumbnails(
    db,
    records.flatMap((album) =>
      album.cover.imageId ? [album.cover.imageId] : [],
    ),
  );
  return records.map((album) => {
    const thumbnail = album.cover.imageId
      ? thumbnails.get(album.cover.imageId)
      : undefined;
    return {
      ...album,
      cover: {
        ...album.cover,
        displayName: thumbnail?.displayName ?? null,
        status: thumbnail?.status ?? ('empty' as const),
        thumbnailUrl: thumbnail?.thumbnailUrl ?? null,
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
