import { isDeliveryErrorCode } from '../../../../server/delivery/errors.ts';
import { parseImageRequest } from '../../../../server/delivery/links.ts';
import { requireOwner } from '../../../../server/identity/owner.ts';
import { readLibraryDetail } from '../../../../server/library/detail.ts';
import { createRuntimeLogger } from '../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    const { id } = await context.params;
    parseImageRequest(id, new URLSearchParams());
    return Response.json(
      readLibraryDetail(getServerRuntime().connection.db, id),
      { headers },
    );
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      'status' in err &&
      typeof err.status === 'number' &&
      (isDeliveryErrorCode(err.code) ||
        (err.code === 'UNAUTHORIZED' && err.status === 401))
    ) {
      return Response.json(
        { code: err.code, message: err.message },
        { status: err.status, headers },
      );
    }
    createRuntimeLogger(
      'library.detail',
      getServerRuntime().config.logLevel,
    ).error({ err }, 'Library detail failed');
    return Response.json(
      { code: 'INTERNAL_SERVER_ERROR', message: '图片详情读取失败，请重试' },
      { status: 500, headers },
    );
  }
}
