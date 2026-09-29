import { randomUUID } from 'node:crypto';
import { requireOwner } from '../../../../server/identity/owner.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';
import { createRuntimeLogger } from '../../../../server/runtime/logger.ts';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    return Response.json(await getServerRuntime().watermarks.receive(request), {
      status: 201,
      headers,
    });
  } catch (error) {
    const detail = error as { code?: string; status?: number };
    const code = detail?.code ?? 'MEDIA_WATERMARK_FAILED';
    const status =
      detail?.status ??
      ([
        'MEDIA_WATERMARK_INVALID',
        'MEDIA_FORMAT_UNSUPPORTED',
        'MEDIA_IDENTIFICATION_FAILED',
      ].includes(code)
        ? 415
        : 500);
    createRuntimeLogger('media.watermark', 'info').error(
      { err: error, requestId },
      'Watermark upload failed',
    );
    return Response.json(
      {
        code,
        message: error instanceof Error ? error.message : String(error),
        requestId,
      },
      { status, headers },
    );
  }
}
