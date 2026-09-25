import { requireOwner } from '../../../server/identity/owner.ts';
import {
  LibraryQueryError,
  parseLibraryQuery,
  readLibraryPage,
} from '../../../server/library/queries.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    const cursor = parseLibraryQuery(new URL(request.url).searchParams);
    return Response.json(
      readLibraryPage(getServerRuntime().connection.db, cursor),
      { headers },
    );
  } catch (err) {
    if (
      err instanceof LibraryQueryError ||
      (err instanceof Error &&
        'code' in err &&
        err.code === 'UNAUTHORIZED' &&
        'status' in err &&
        err.status === 401)
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: err instanceof LibraryQueryError ? 400 : 401, headers },
      );
    createRuntimeLogger(
      'library.query',
      getServerRuntime().config.logLevel,
    ).error({ err }, 'Library query failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '图库读取失败，请重试' },
      { status: 500, headers },
    );
  }
}
