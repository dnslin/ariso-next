import { z } from 'zod';
import { setAlbumCover } from '../../../../../server/collections/cover.ts';
import { CollectionError } from '../../../../../server/collections/errors.ts';
import {
  collectionBody,
  collectionResponse,
} from '../../../../../server/collections/http.ts';
import { readOwnerAlbum } from '../../../../../server/library/album-covers.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.strictObject({ imageId: z.string().min(1).nullable() });

export function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return collectionResponse(request, 'albums', async () => {
    const { id } = await context.params;
    const parsed = inputSchema.safeParse(await collectionBody(request));
    if (!parsed.success)
      throw new CollectionError(
        'COLLECTION_INVALID_INPUT',
        '请指定封面图片 ID，或用 null 切回自动封面',
      );
    return getServerRuntime().connection.db.transaction(
      (tx) => {
        setAlbumCover(tx, id, parsed.data.imageId);
        return { album: readOwnerAlbum(tx, id) };
      },
      { behavior: 'immediate' },
    );
  });
}
