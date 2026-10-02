import { readOwnerAlbum } from '../../../../server/library/album-covers.ts';
import { CollectionError } from '../../../../server/collections/errors.ts';
import {
  collectionBody,
  collectionResponse,
} from '../../../../server/collections/http.ts';
import {
  deleteAlbum,
  updateAlbum,
} from '../../../../server/collections/records.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return collectionResponse(request, 'albums', async () => {
    const { id } = await context.params;
    return getServerRuntime().connection.db.transaction((tx) => ({
      album: readOwnerAlbum(tx, id),
    }));
  });
}
export function PATCH(request: Request, context: Context) {
  return collectionResponse(request, 'albums', async () => {
    const { id } = await context.params;
    const input = await collectionBody(request);
    return getServerRuntime().connection.db.transaction(
      (tx) => {
        updateAlbum(tx, id, input);
        return { album: readOwnerAlbum(tx, id) };
      },
      { behavior: 'immediate' },
    );
  });
}
export function DELETE(request: Request, context: Context) {
  return collectionResponse(request, 'albums', async () => {
    const { id } = await context.params;
    return getServerRuntime().connection.db.transaction(
      (tx) => {
        if (!deleteAlbum(tx, id))
          throw new CollectionError(
            'COLLECTION_TARGET_NOT_FOUND',
            '相册不存在或已被删除',
          );
        return { deleted: true };
      },
      { behavior: 'immediate' },
    );
  });
}
