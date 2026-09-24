import { randomUUID } from 'node:crypto';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { UploadError } from './errors.ts';
import type { UploadSession } from './schema.ts';
import type { getSubmission } from './sessions.ts';

export function sessionResult(session: UploadSession) {
  return {
    id: session.id,
    queueItemId: session.queueItemId,
    originalName: session.originalName,
    declaredSize: session.declaredSize,
    state: session.state,
    imageId: session.imageId,
    jobId: session.jobId,
    byteSize: session.byteSize,
    errorCode: session.errorCode,
    error: session.error,
    cleanupStatus: session.cleanupStatus,
  };
}
export function submissionResult(submission: ReturnType<typeof getSubmission>) {
  return {
    id: submission.id,
    storageId: submission.storageId,
    visibility: submission.visibility,
    maxFileBytes: submission.maxFileBytes,
    sessions: submission.sessions.map((session) => ({
      ...sessionResult(session),
      image: session.image,
      job: session.job,
    })),
  };
}

export async function uploadResponse(
  request: Request,
  operation: (
    runtime: ReturnType<typeof getServerRuntime>,
  ) => unknown | Promise<unknown>,
  status = 200,
) {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    return Response.json(await operation(getServerRuntime()), {
      status,
      headers,
    });
  } catch (error) {
    const detail = error as {
      code?: string;
      status?: number;
      imageId?: string;
    };
    const code =
      typeof detail?.code === 'string' ? detail.code : 'UPLOAD_INTERNAL_ERROR';
    const status =
      detail?.status ??
      (error instanceof SyntaxError || code === 'COLLECTION_INVALID_INPUT'
        ? 400
        : [
              'COLLECTION_TARGET_NOT_FOUND',
              'COLLECTION_TARGET_REMOVED',
              'COLLECTION_IMAGE_UNAVAILABLE',
              'STORAGE_NOT_FOUND',
              'STORAGE_DISABLED',
              'DEFAULT_STORAGE_UNSET',
              'DEFAULT_STORAGE_DISABLED',
            ].includes(code)
          ? 409
          : code === 'MEDIA_FORMAT_UNSUPPORTED' ||
              code === 'MEDIA_IDENTIFICATION_FAILED'
            ? 415
            : 500);
    createRuntimeLogger('upload.http', 'info').error(
      { err: error, requestId, path: new URL(request.url).pathname },
      'Upload request failed',
    );
    return Response.json(
      {
        code,
        message: error instanceof Error ? error.message : String(error),
        imageId: detail?.imageId ?? null,
        requestId,
      },
      { status, headers },
    );
  }
}

/** Metadata has a separate bounded budget; image bytes use the streaming receiver. */
export async function readUploadJson(request: Request) {
  if (!request.body)
    throw new UploadError('UPLOAD_INVALID_INPUT', '缺少请求内容');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) {
        await reader.cancel();
        throw new UploadError(
          'UPLOAD_METADATA_TOO_LARGE',
          '上传元数据超过 256 KiB',
          413,
        );
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    reader.releaseLock();
  }
}
