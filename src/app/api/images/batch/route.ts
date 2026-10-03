import { requireOwner } from '../../../../server/identity/owner.ts';
import {
  parseLibraryBatch,
  runLibraryBatch,
} from '../../../../server/library/batch.ts';
import { LibraryQueryError } from '../../../../server/library/query-schema.ts';
import { createRuntimeLogger } from '../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new LibraryQueryError(
          '批量操作请求必须为有效 JSON',
          'LIBRARY_INVALID_BATCH',
        );
      throw error;
    }
    // Reject malformed requests before touching the runtime or any selected image.
    const input = parseLibraryBatch(body);
    const server = getServerRuntime();
    const logger = createRuntimeLogger('library.batch', server.config.logLevel);
    return Response.json(
      await runLibraryBatch(server.connection.db, input, (err, imageId) => {
        logger.error(
          {
            err,
            imageId,
            command: input.command.type,
            mode: input.mode,
            count: input.ids.length,
          },
          'Library batch item failed',
        );
      }),
      { headers },
    );
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
    createRuntimeLogger(
      'library.batch',
      getServerRuntime().config.logLevel,
    ).error({ err }, 'Library batch failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '批量操作失败，结果待核对' },
      { status: 500, headers },
    );
  }
}
