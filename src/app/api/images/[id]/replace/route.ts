import { isContentMutationPaused } from '../../../../../server/runtime/content-mutations.ts';
import { requireOwner } from '../../../../../server/identity/owner.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { readImageReplacement } from '../../../../../server/media/replacement.ts';
import { MediaReprocessError } from '../../../../../server/media/reprocess.ts';
import { MultipartReceiveError } from '../../../../../server/upload/multipart.ts';
import { UploadError } from '../../../../../server/upload/errors.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { analyzeMediaError } from '../../../../../server/media/errors.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context, write: boolean) {
  let imageId: string | undefined;
  try {
    await requireOwner(request);
    const runMutation = async () => {
      imageId = (await context.params).id;
      const app = getServerRuntime();
      const data = write
        ? await app.replacements.receive(imageId, request)
        : readImageReplacement(app.connection.db, imageId);
      return Response.json(data, { status: write ? 202 : 200, headers });
    };
    return write
      ? await getServerRuntime().contentMutations.run(
          'images/[id]/replace/route.ts:handle',
          runMutation,
        )
      : await runMutation();
  } catch (error) {
    if (isContentMutationPaused(error))
      return Response.json(
        { code: error.code, message: error.message },
        { status: 409, headers },
      );

    if (
      error instanceof MediaReprocessError ||
      error instanceof MultipartReceiveError ||
      error instanceof UploadError ||
      (error instanceof Error &&
        'code' in error &&
        'status' in error &&
        (error.code === 'UNAUTHORIZED' || error.code === 'INVALID_ORIGIN'))
    ) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: Number(error.status), headers },
      );
    }
    const analysis = analyzeMediaError(error);
    if (
      ['MEDIA_IDENTIFICATION_FAILED', 'MEDIA_FORMAT_UNSUPPORTED'].includes(
        analysis.code,
      )
    )
      return Response.json(
        { code: analysis.code, message: '文件内容不是支持的图片，请重新选择' },
        { status: 422, headers },
      );
    createRuntimeLogger('media.replace', 'info').error(
      { err: error, imageId },
      'Image replacement request failed',
    );
    return Response.json(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: '替换提交失败，请检查日志后重试',
      },
      { status: 500, headers },
    );
  }
}
export function GET(request: Request, context: Context) {
  return handle(request, context, false);
}
export function POST(request: Request, context: Context) {
  return handle(request, context, true);
}
