import {
  listOwnerAlbums,
  readOwnerAlbum,
} from '../../../server/library/album-covers.ts';
import { parseAlbumQuery } from '../../../server/collections/album-management.ts';
import { createAlbum } from '../../../server/collections/records.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';
import { albumBody, albumResponse } from './response.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return albumResponse(request, () =>
    listOwnerAlbums(
      getServerRuntime().connection.db,
      parseAlbumQuery(new URL(request.url).searchParams),
    ),
  );
}
export function POST(request: Request) {
  return albumResponse(
    request,
    async () => {
      const input = await albumBody(request);
      return getServerRuntime().connection.db.transaction(
        (tx) => ({ album: readOwnerAlbum(tx, createAlbum(tx, input).id) }),
        { behavior: 'immediate' },
      );
    },
    201,
  );
}
