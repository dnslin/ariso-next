import { respondToMediaCleanup } from '../../../../server/media/cleanup-http.ts';
import { isDeliveryErrorCode } from '../../../../server/delivery/errors.ts';
import { parseImageRequest } from '../../../../server/delivery/links.ts';
import { requireOwner } from '../../../../server/identity/owner.ts';
import { readLibraryDetail } from '../../../../server/library/detail.ts';
import {
  MediaImageFieldsError,
  imageFieldsSchema,
  updateImageFields,
} from '../../../../server/media/image-fields.ts';
import { ZodError } from 'zod';
import { createRuntimeLogger } from '../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    const { id } = await context.params;
    parseImageRequest(id, new URLSearchParams());
    return Response.json(
      readLibraryDetail(getServerRuntime().connection.db, id),
      { headers },
    );
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      'status' in err &&
      typeof err.status === 'number' &&
      (isDeliveryErrorCode(err.code) ||
        (err.code === 'UNAUTHORIZED' && err.status === 401))
    ) {
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    }
    createRuntimeLogger(
      'library.detail',
      getServerRuntime().config.logLevel,
    ).error({ err }, 'Library detail failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '图片详情读取失败，请重试' },
      { status: 500, headers },
    );
  }
}

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
        { code: 'INVALID_IMAGE_FIELDS', message: '图片资料须为 JSON 对象' },
        { status: 400, headers },
      );
    }
    const patch = imageFieldsSchema.parse(input);
    const db = getServerRuntime().connection.db;
    return Response.json(
      db.transaction(
        (tx) => {
          updateImageFields(tx, id, patch);
          return readLibraryDetail(tx, id);
        },
        { behavior: 'immediate' },
      ),
      { headers },
    );
  } catch (err) {
    if (err instanceof ZodError)
      return Response.json(
        {
          code: 'INVALID_IMAGE_FIELDS',
          message: err.issues.map((issue) => issue.message).join('；'),
        },
        { status: 400, headers },
      );
    if (err instanceof MediaImageFieldsError)
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
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
      'library.detail',
      getServerRuntime().config.logLevel,
    ).error({ err, imageId }, 'Image fields update failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '图片资料保存失败，请重试' },
      { status: 500, headers },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return respondToMediaCleanup(request, context, 'delete');
}
