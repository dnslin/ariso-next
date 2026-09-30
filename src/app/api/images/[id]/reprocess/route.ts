import { ZodError } from 'zod';
import { requireOwner } from '../../../../../server/identity/owner.ts';
import {
  MediaReprocessError,
  requestReprocess,
} from '../../../../../server/media/reprocess.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { 'Cache-Control': 'no-store' };
  let imageId: string | undefined;
  try {
    await requireOwner(request);
    imageId = (await context.params).id;
    const body = await request.text();
    const result = requestReprocess(
      getServerRuntime().connection.db,
      imageId,
      body.length ? JSON.parse(body) : {},
    );
    return Response.json(result, { status: 202, headers });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError)
      return Response.json(
        { code: 'INVALID_REPROCESS_INPUT', message: '请提供有效的重处理范围' },
        { status: error instanceof SyntaxError ? 400 : 422, headers },
      );
    if (
      error instanceof MediaReprocessError ||
      (error instanceof Error &&
        'status' in error &&
        'code' in error &&
        ((error.status === 401 && error.code === 'UNAUTHORIZED') ||
          (error.status === 403 && error.code === 'INVALID_ORIGIN')))
    )
      return Response.json(
        { code: error.code, message: error.message },
        {
          status:
            error instanceof MediaReprocessError
              ? error.status
              : error.status === 401
                ? 401
                : 403,
          headers,
        },
      );
    createRuntimeLogger('media.reprocess', 'info').error(
      { err: error, imageId, path: new URL(request.url).pathname },
      'Reprocessing request failed',
    );
    return Response.json(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '重处理提交失败，请检查服务日志后重试',
      },
      { status: 500, headers },
    );
  }
}
