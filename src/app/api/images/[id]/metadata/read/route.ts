import { requireOwner } from '../../../../../../server/identity/owner.ts';
import {
  MediaMetadataError,
  requestMetadataRead,
} from '../../../../../../server/media/metadata.ts';
import { createRuntimeLogger } from '../../../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../../../server/startup/server-start.ts';

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
    if ((await request.text()).length > 0)
      return Response.json(
        {
          code: 'INVALID_METADATA_READ_INPUT',
          message: '元数据重读不接受请求参数',
        },
        { status: 422, headers },
      );
    return Response.json(
      requestMetadataRead(getServerRuntime().connection.db, imageId),
      { status: 202, headers },
    );
  } catch (err) {
    if (err instanceof MediaMetadataError)
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
      'media.metadata',
      getServerRuntime().config.logLevel,
    ).error(
      { err, imageId, path: new URL(request.url).pathname },
      'Metadata read request failed',
    );
    return Response.json(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '元数据重读提交失败，请检查服务日志后重试',
      },
      { status: 500, headers },
    );
  }
}
