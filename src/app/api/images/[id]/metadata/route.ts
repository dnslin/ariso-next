import { eq } from 'drizzle-orm';
import {
  isDeliveryErrorCode,
  deliveryError,
} from '../../../../../server/delivery/errors.ts';
import { parseImageRequest } from '../../../../../server/delivery/links.ts';
import { requireOwner } from '../../../../../server/identity/owner.ts';
import { readMediaMetadata } from '../../../../../server/media/metadata.ts';
import { mediaImages } from '../../../../../server/media/schema.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { 'Cache-Control': 'no-store' };
  let imageId: string | undefined;
  try {
    await requireOwner(request);
    const { id } = await context.params;
    imageId = id;
    parseImageRequest(id, new URLSearchParams());
    return Response.json(
      getServerRuntime().connection.db.transaction((tx) => {
        if (
          !tx
            .select({ id: mediaImages.id })
            .from(mediaImages)
            .where(eq(mediaImages.id, id))
            .get()
        )
          throw deliveryError('IMAGE_NOT_FOUND');
        return readMediaMetadata(tx, id);
      }),
      { headers },
    );
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      'status' in err &&
      typeof err.status === 'number' &&
      (isDeliveryErrorCode(err.code) ||
        (err.status === 401 && err.code === 'UNAUTHORIZED'))
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    createRuntimeLogger(
      'library.metadata',
      getServerRuntime().config.logLevel,
    ).error({ err, imageId }, 'Metadata detail failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '元数据详情读取失败，请重试' },
      { status: 500, headers },
    );
  }
}
