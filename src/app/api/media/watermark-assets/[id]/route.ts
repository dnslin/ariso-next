import { requireOwner } from '../../../../../server/identity/owner.ts';
import { readWatermarkAsset } from '../../../../../server/media/watermark-assets.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  let assetId: string | undefined;
  try {
    await requireOwner(request);
    assetId = (await context.params).id;
    return Response.json(
      readWatermarkAsset(getServerRuntime().connection.db, assetId),
      { headers },
    );
  } catch (error) {
    const detail = error as { code?: string; status?: number };
    if (error instanceof Error && detail.status && detail.status < 500)
      return Response.json(
        { code: detail.code, message: error.message },
        { status: detail.status, headers },
      );
    createRuntimeLogger('media.watermark', 'info').error(
      { err: error, assetId },
      'Watermark asset read failed',
    );
    return Response.json(
      {
        code: 'MEDIA_WATERMARK_READ_FAILED',
        message: '水印素材信息读取失败，请检查服务日志',
      },
      { status: 500, headers },
    );
  }
}
