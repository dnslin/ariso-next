import { requireOwner } from '../../../../server/identity/owner.ts';
import {
  MediaTrashError,
  type trashImage,
} from '../../../../server/media/trash.ts';
import { createRuntimeLogger } from '../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export async function respondToTrashMutation(
  request: Request,
  context: { params: Promise<{ id: string }> },
  operation: typeof trashImage,
) {
  const headers = { 'Cache-Control': 'no-store' };
  let imageId: string | undefined;
  try {
    await requireOwner(request);
    imageId = (await context.params).id;
    const { connection } = getServerRuntime();
    return Response.json(operation(connection.db, imageId), { headers });
  } catch (err) {
    if (err instanceof MediaTrashError)
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    if (
      err instanceof Error &&
      'status' in err &&
      'code' in err &&
      ((err.status === 401 && err.code === 'UNAUTHORIZED') ||
        (err.status === 403 && err.code === 'INVALID_ORIGIN'))
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    createRuntimeLogger(
      'media.trash',
      getServerRuntime().config.logLevel,
    ).error(
      { err, imageId, path: new URL(request.url).pathname },
      'Image trash mutation failed',
    );
    return Response.json(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '回收或恢复失败，请检查服务日志后重试',
      },
      { status: 500, headers },
    );
  }
}
