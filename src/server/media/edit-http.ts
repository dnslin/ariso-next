import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { requireOwner } from '../identity/owner.ts';
import { isContentMutationPaused } from '../runtime/content-mutations.ts';
import { createSecretCrypto } from '../runtime/crypto.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { analyzeMediaError } from './errors.ts';
import type { MediaRuntime } from './process.ts';

export function editRuntime(): MediaRuntime {
  const app = getServerRuntime();
  return {
    db: app.connection.db,
    storageRoot: resolve(app.config.dataDir, 'storage'),
    temporaryRoot: resolve(app.config.dataDir, 'tmp'),
    watermarksRoot: resolve(app.config.dataDir, 'assets', 'watermarks'),
    secretCrypto: createSecretCrypto(app.config.encryptionKey),
    resources: app.mediaResources,
    logger: createRuntimeLogger('media.edit', app.config.logLevel),
  };
}

export async function editResponse(
  request: Request,
  action: () => Response | Promise<Response>,
  mutation = false,
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    await requireOwner(request);
    return mutation
      ? await getServerRuntime().contentMutations.run(
          'media.image-edit',
          action,
        )
      : await action();
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        {
          code: 'MEDIA_EDIT_INVALID',
          message: error.issues[0]?.message ?? '图片编辑参数无效',
          issues: error.issues,
        },
        { status: 400, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { code: 'INVALID_JSON', message: '请求不是有效的JSON' },
        { status: 400, headers },
      );
    if (isContentMutationPaused(error))
      return Response.json(
        { code: error.code, message: error.message },
        { status: 409, headers },
      );
    const detail = error as { status?: number; code?: string };
    if (
      error instanceof Error &&
      detail.status &&
      detail.status >= 400 &&
      detail.status < 500
    )
      return Response.json(
        { code: detail.code, message: error.message },
        { status: detail.status, headers },
      );
    const analysis = analyzeMediaError(error);
    const status =
      analysis.code === 'INSUFFICIENT_DISK_SPACE'
        ? 507
        : [
              'MEDIA_WATERMARK_TOO_LARGE',
              'MEDIA_EDIT_FORMAT_UNSUPPORTED',
              'MEDIA_IDENTIFICATION_FAILED',
              'MEDIA_FORMAT_UNSUPPORTED',
            ].includes(analysis.code)
          ? 422
          : 500;
    createRuntimeLogger('media.edit', 'info').error(
      { err: error },
      'Image editing request failed',
    );
    return Response.json(
      {
        code: analysis.code,
        message:
          error instanceof Error
            ? error.message
            : '图片编辑失败，请检查服务日志',
      },
      { status, headers },
    );
  }
}
