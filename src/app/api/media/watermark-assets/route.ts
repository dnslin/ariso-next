import { randomUUID } from 'node:crypto';
import { requireOwner } from '../../../../server/identity/owner.ts';
import { analyzeMediaError } from '../../../../server/media/errors.ts';
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
    const analysis = analyzeMediaError(error);
    const code =
      detail?.code?.startsWith('MEDIA_') ||
      analysis.code === 'MEDIA_PROCESS_FAILED'
        ? (detail?.code ?? 'MEDIA_WATERMARK_FAILED')
        : analysis.code;
    const status =
      detail?.status ??
      ([
        'MEDIA_WATERMARK_INVALID',
        'MEDIA_FORMAT_UNSUPPORTED',
        'MEDIA_IDENTIFICATION_FAILED',
        'MEDIA_RESOURCE_LIMIT',
      ].includes(code)
        ? 422
        : code === 'INSUFFICIENT_DISK_SPACE'
          ? 507
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
