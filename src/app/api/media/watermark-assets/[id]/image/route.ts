import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  editResponse,
  editRuntime,
} from '../../../../../../server/media/edit-http.ts';
import { mediaError } from '../../../../../../server/media/errors.ts';
import { readWatermarkAsset } from '../../../../../../server/media/watermark-assets.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return editResponse(request, async () => {
    const { id } = await context.params;
    const app = editRuntime();
    const asset = readWatermarkAsset(app.db, id);
    if (!asset.available)
      throw Object.assign(
        mediaError('MEDIA_WATERMARK_UNAVAILABLE', '水印素材已到期或正在清理'),
        { status: 409 },
      );
    if (!app.watermarksRoot)
      throw mediaError('MEDIA_WATERMARK_ASSET_MISSING', '水印素材目录未配置');
    const file = await open(join(app.watermarksRoot, asset.path), 'r');
    const stream = file.createReadStream({
      autoClose: true,
      signal: request.signal,
    });
    stream.on('error', (error) => {
      if (request.signal.aborted)
        app.logger.info({ assetId: id }, 'Watermark image read cancelled');
      else
        app.logger.error(
          { err: error, assetId: id, path: asset.path },
          'Watermark image stream failed',
        );
    });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': asset.mime!,
        'Content-Length': String(asset.byteSize),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
