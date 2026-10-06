import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { verifyUploadToken } from '../identity/tokens.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { UploadError } from './errors.ts';
import type { PublicUploadError } from './public-contract.ts';
import { createPublicReceipt } from './public-receive.ts';
import { waitPublicUpload } from './public-result.ts';

export function publicUploadFailure(
  error: unknown,
  requestId: string,
  stage: string,
  imageId: string | null = null,
) {
  const primary = error instanceof AggregateError ? error.errors[0] : error;
  const detail = primary as {
    code?: string;
    status?: number;
    stage?: string;
  } | null;
  const operationStage = (error as { stage?: string } | null)?.stage;
  const code =
    typeof detail?.code === 'string' ? detail.code : 'UPLOAD_INTERNAL_ERROR';
  const status =
    detail?.status ??
    (code === 'MEDIA_TOOL_UNAVAILABLE'
      ? 503
      : code === 'MEDIA_TOOL_TIMEOUT' || code === 'STORAGE_TIMEOUT'
        ? 504
        : code === 'ENOSPC' || code === 'INSUFFICIENT_DISK_SPACE'
          ? 507
          : code.startsWith('STORAGE_')
            ? [
                'STORAGE_DISABLED',
                'STORAGE_NOT_FOUND',
                'STORAGE_TYPE_UNSUPPORTED',
              ].includes(code)
              ? 409
              : 502
            : code.startsWith('DEFAULT_STORAGE_') ||
                [
                  'COLLECTION_TARGET_NOT_FOUND',
                  'COLLECTION_TARGET_REMOVED',
                ].includes(code)
              ? 409
              : [
                    'MEDIA_FORMAT_UNSUPPORTED',
                    'MEDIA_IDENTIFICATION_FAILED',
                  ].includes(code)
                ? 415
                : code === 'COLLECTION_INVALID_INPUT'
                  ? 400
                  : 500);
  const body: PublicUploadError = {
    imageId,
    status: imageId ? 'unavailable' : 'not_created',
    error: {
      code,
      stage: detail?.stage ?? operationStage ?? stage,
      message: primary instanceof Error ? primary.message : String(primary),
    },
    requestId,
  };
  return {
    status,
    body,
  };
}

export async function publicUploadResponse(request: Request) {
  const requestId = randomUUID();
  let stage = 'authentication';
  let imageId: string | null = null;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    // Cookie never replaces Bearer, and no request body is read before admission.
    const token = await verifyUploadToken(request);
    if (!token)
      throw new UploadError(
        'UPLOAD_TOKEN_INVALID',
        '上传 Token 缺失、无效、已停用或已过期',
        401,
      );
    stage = 'receiving';
    const runtime = getServerRuntime();
    const context = {
      db: runtime.connection.db,
      storageRoot: resolve(runtime.config.dataDir, 'storage'),
      temporaryRoot: resolve(runtime.config.dataDir, 'tmp'),
    };
    const id = createPublicReceipt(context);
    const accepted = await runtime.uploads.receivePublic(
      id,
      request,
      token.tokenId,
    );
    if (!accepted.imageId || !accepted.jobId)
      throw new UploadError(
        'UPLOAD_INTERNAL_ERROR',
        '上传没有完成媒体任务交接',
        500,
      );
    imageId = accepted.imageId;
    stage = 'waiting';
    const result = await waitPublicUpload(
      context,
      { imageId, jobId: accepted.jobId },
      requestId,
      { signal: request.signal },
    );
    return Response.json(result.body, {
      status: result.status,
      headers,
    });
  } catch (error) {
    // Log the failure without request headers, Token plaintext or SQL-bound request data.
    const primary = error instanceof AggregateError ? error.errors[0] : error;
    const cause =
      primary instanceof Error && primary.cause instanceof Error
        ? primary.cause
        : primary;
    createRuntimeLogger('upload.public', 'info').error(
      { err: cause, requestId, imageId, stage },
      'Public upload request failed',
    );
    const result = publicUploadFailure(error, requestId, stage, imageId);
    return Response.json(result.body, {
      status: result.status,
      headers,
    });
  }
}
