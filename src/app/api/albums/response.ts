import { CollectionError } from '../../../server/collections/errors.ts';
import { requireOwner } from '../../../server/identity/owner.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export async function albumResponse(
  request: Request,
  operation: () => Promise<unknown> | unknown,
  status = 200,
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    return Response.json(await operation(), { status, headers });
  } catch (err) {
    if (err instanceof CollectionError)
      return Response.json(
        { code: err.code, message: err.message },
        {
          status: err.code === 'COLLECTION_TARGET_NOT_FOUND' ? 404 : 400,
          headers,
        },
      );
    if (
      err instanceof Error &&
      'code' in err &&
      'status' in err &&
      ((err.code === 'UNAUTHORIZED' && err.status === 401) ||
        (err.code === 'INVALID_ORIGIN' && err.status === 403))
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    createRuntimeLogger(
      'collections.albums',
      getServerRuntime().config.logLevel,
    ).error(
      { err, method: request.method, path: new URL(request.url).pathname },
      'Album management failed',
    );
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '相册操作失败，请重试' },
      { status: 500, headers },
    );
  }
}

export async function albumBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new CollectionError(
      'COLLECTION_INVALID_INPUT',
      '请求内容必须是有效的 JSON',
    );
  }
}
