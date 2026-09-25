import { requireOwner } from '../../../server/identity/owner.ts';
import {
  TrashQueryError,
  parseTrashQuery,
  readTrashPage,
} from '../../../server/library/trash.ts';
import { createRuntimeLogger } from '../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    const page = parseTrashQuery(new URL(request.url).searchParams);
    return Response.json(
      readTrashPage(getServerRuntime().connection.db, page),
      { headers },
    );
  } catch (err) {
    if (
      err instanceof TrashQueryError ||
      (err instanceof Error &&
        'code' in err &&
        err.code === 'UNAUTHORIZED' &&
        'status' in err &&
        err.status === 401)
    )
      return Response.json(
        { code: err.code, message: err.message },
        { status: err instanceof TrashQueryError ? 400 : 401, headers },
      );
    createRuntimeLogger(
      'library.trash',
      getServerRuntime().config.logLevel,
    ).error({ err }, 'Trash query failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '回收站读取失败，请重试' },
      { status: 500, headers },
    );
  }
}
