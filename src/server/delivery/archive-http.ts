import { requireOwner } from '../identity/owner.ts';
import { LibraryQueryError } from '../library/query-schema.ts';
import type { ArchivePreparation } from '../library/archive-types.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';

export async function respondToArchive(
  request: Request,
  action: () => Promise<Response | ArchivePreparation>,
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    await requireOwner(request);
    const result = await action();
    return result instanceof Response
      ? result
      : Response.json(result, { headers });
  } catch (err) {
    if (
      err instanceof LibraryQueryError ||
      (err instanceof Error &&
        'code' in err &&
        'status' in err &&
        ((err.code === 'UNAUTHORIZED' && err.status === 401) ||
          (err.code === 'INVALID_ORIGIN' && err.status === 403)))
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: Number(err.status), headers },
      );
    if (!request.signal.aborted)
      createRuntimeLogger('delivery.archive', 'error').error(
        { err, path: new URL(request.url).pathname },
        'Archive request failed',
      );
    return Response.json(
      { code: 'ARCHIVE_FAILED', message: '打包下载准备失败，请重新检查后重试' },
      { status: 500, headers },
    );
  }
}
