import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import {
  MediaCleanupError,
  readMediaCleanup,
  requestPermanentDelete,
  retryMediaCleanup,
} from './cleanup.ts';

export async function respondToMediaCleanup(
  request: Request,
  context: { params: Promise<{ id: string }> },
  operation: 'read' | 'delete' | 'retry',
) {
  const headers = { 'Cache-Control': 'no-store' };
  let imageId: string | undefined;
  try {
    await requireOwner(request);
    imageId = (await context.params).id;
    const db = getServerRuntime().connection.db;
    const result =
      operation === 'read'
        ? readMediaCleanup(db, imageId)
        : operation === 'retry'
          ? retryMediaCleanup(db, imageId)
          : requestPermanentDelete(db, imageId);
    return Response.json(result, {
      status: operation === 'read' || result.status === 'succeeded' ? 200 : 202,
      headers,
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && 'status' in err) {
      const { code, status } = err;
      if (
        typeof status === 'number' &&
        (err instanceof MediaCleanupError ||
          (status === 401 && code === 'UNAUTHORIZED') ||
          (status === 403 && code === 'INVALID_ORIGIN'))
      )
        return Response.json(
          { code, message: err.message },
          { status, headers },
        );
    }
    createRuntimeLogger(
      'media.cleanup',
      getServerRuntime().config.logLevel,
    ).error({ err, imageId }, 'Permanent image deletion failed');
    return Response.json(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '永久删除操作失败，请检查服务日志并核对任务状态',
      },
      { status: 500, headers },
    );
  }
}
