import { ZodError } from 'zod';
import { CollectionError } from '../../../../../server/collections/errors.ts';
import { isDeliveryErrorCode } from '../../../../../server/delivery/errors.ts';
import { parseImageRequest } from '../../../../../server/delivery/links.ts';
import { requireOwner } from '../../../../../server/identity/owner.ts';
import { updateImageCollections } from '../../../../../server/library/image-collections.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
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
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { code: 'COLLECTION_INVALID_INPUT', message: '图片关系须为 JSON 对象' },
        { status: 400, headers },
      );
    }
    return Response.json(
      updateImageCollections(getServerRuntime().connection.db, id, input),
      { headers },
    );
  } catch (err) {
    if (err instanceof ZodError)
      return Response.json(
        {
          code: 'COLLECTION_INVALID_INPUT',
          message: err.issues.map((issue) => issue.message).join('；'),
        },
        { status: 400, headers },
      );
    if (err instanceof CollectionError)
      return Response.json(
        { code: err.code, message: err.message },
        {
          status: err.code === 'COLLECTION_INVALID_INPUT' ? 400 : 409,
          headers,
        },
      );
    if (
      err instanceof Error &&
      'code' in err &&
      'status' in err &&
      typeof err.status === 'number' &&
      (isDeliveryErrorCode(err.code) ||
        (err.status === 401 && err.code === 'UNAUTHORIZED') ||
        (err.status === 403 && err.code === 'INVALID_ORIGIN'))
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    createRuntimeLogger(
      'library.collections',
      getServerRuntime().config.logLevel,
    ).error({ err, imageId }, 'Image collections update failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '图片关系保存失败，请重试' },
      { status: 500, headers },
    );
  }
}
