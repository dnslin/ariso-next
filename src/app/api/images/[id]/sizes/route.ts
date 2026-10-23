import { isContentMutationPaused } from '../../../../../server/runtime/content-mutations.ts';
import { requireOwner } from '../../../../../server/identity/owner.ts';
import {
  ImageSizeError,
  parseImageSizeInput,
  readImageSize,
  requestImageSize,
} from '../../../../../server/media/sizes.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';
import { buildImageLinks } from '../../../../../server/delivery/links.ts';
import { requireSiteSettings } from '../../../../../server/site/settings.ts';
import { mediaImages } from '../../../../../server/media/schema.ts';
import { eq } from 'drizzle-orm';
import type { ImageSizeResponse } from '../../../../../server/delivery/size-types.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  let imageId: string | undefined;
  try {
    await requireOwner(request);
    const runMutation = async () => {
      let value: unknown;
      if (request.method === 'POST') value = await request.json();
      else {
        const params = new URL(request.url).searchParams;
        if (
          params.getAll('version').length !== 1 ||
          params.getAll('preset').length !== 1 ||
          [...params.keys()].some(
            (key) => key !== 'version' && key !== 'preset',
          )
        )
          throw new ImageSizeError(
            'MEDIA_SIZE_INVALID',
            400,
            '尺寸查询需要一个固定版本和预设',
          );
        value = Object.fromEntries(params);
      }
      const input = parseImageSizeInput(value);
      imageId = (await context.params).id;
      const db = getServerRuntime().connection.db;
      const result =
        request.method === 'POST'
          ? requestImageSize(db, imageId, input)
          : readImageSize(db, imageId, input);
      const response: ImageSizeResponse = { ...result, links: null };
      if (result.status === 'ready') {
        const image = db
          .select({ displayName: mediaImages.displayName })
          .from(mediaImages)
          .where(eq(mediaImages.id, imageId))
          .get()!;
        response.links = buildImageLinks(
          requireSiteSettings(db).publicUrl,
          imageId,
          image.displayName,
          input.version,
          input.preset,
        );
      }
      return Response.json(response, {
        headers,
        status:
          request.method === 'POST' &&
          ['queued', 'running'].includes(result.status)
            ? 202
            : 200,
      });
    };
    return request.method === 'POST'
      ? await getServerRuntime().contentMutations.run(
          'images/[id]/sizes/route.ts:handle',
          runMutation,
        )
      : await runMutation();
  } catch (error) {
    if (isContentMutationPaused(error))
      return Response.json(
        { code: error.code, message: error.message },
        { status: 409, headers },
      );

    if (error instanceof SyntaxError)
      return Response.json(
        { code: 'MEDIA_SIZE_INVALID', message: '请提供有效的尺寸生成参数' },
        { status: 400, headers },
      );
    if (
      error instanceof ImageSizeError ||
      (error instanceof Error &&
        'status' in error &&
        'code' in error &&
        ((error.status === 401 && error.code === 'UNAUTHORIZED') ||
          (error.status === 403 && error.code === 'INVALID_ORIGIN')))
    )
      return Response.json(
        { code: error.code, message: error.message },
        { status: Number(error.status), headers },
      );
    createRuntimeLogger('media.size', 'error').error(
      { err: error, imageId },
      'Size request failed',
    );
    return Response.json(
      { code: 'MEDIA_SIZE_FAILED', message: '尺寸状态读取或生成失败，请重试' },
      { status: 500, headers },
    );
  }
}
export { handle as GET, handle as POST };
