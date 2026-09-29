import { requireOwner } from '../../../server/identity/owner.ts';
import { LibraryQueryError } from '../../../server/library/query-schema.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export async function respondToLibraryQuery(
  request: Request,
  read: () => unknown | Promise<unknown>,
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    return Response.json(await read(), { headers });
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
        {
          status:
            err instanceof LibraryQueryError ? err.status : Number(err.status),
          headers,
        },
      );
    createRuntimeLogger(
      'library.query',
      getServerRuntime().config.logLevel,
    ).error(
      { err, path: new URL(request.url).pathname },
      'Library query failed',
    );
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '图库读取失败，请重试' },
      { status: 500, headers },
    );
  }
}
