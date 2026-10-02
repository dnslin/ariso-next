import { createReadStream, createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { retainMediaInput } from '../media/input.ts';
import { identifyImageFile } from '../media/file-formats.ts';
import { createMediaResources } from '../media/resources.ts';
import { clientConfig } from '../storage/probes.ts';
import { createS3Storage } from '../storage/s3.ts';
import { requireSiteSettings } from '../site/settings.ts';
import { acceptSession } from './accept.ts';
import { cleanupSession, type UploadContext } from './cleanup.ts';
import { UploadError } from './errors.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';
import { getSession, requireSessionStorage } from './sessions.ts';

export function uploadTemporaryRoot(context: UploadContext) {
  if (!context.temporaryRoot)
    throw new UploadError('UPLOAD_RUNTIME_MISSING', 'S3 上传缺少暂存目录', 500);
  return context.temporaryRoot;
}
export function uploadS3Storage(context: UploadContext, storageId: string) {
  if (!context.secretCrypto)
    throw new UploadError(
      'UPLOAD_RUNTIME_MISSING',
      'S3 上传缺少凭据解密器',
      500,
    );
  const storage = context.db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, storageId))
    .get()!;
  return createS3Storage({
    ...clientConfig({ secretCrypto: context.secretCrypto }, storage),
    enabled: storage.enabled,
  });
}
// Storage rows remain available for exact-key cleanup after disabling a target.
import { storageConfigs } from '../storage/schema.ts';

export function touchUpload(context: UploadContext, id: string) {
  const session = getSession(context.db, id);
  const now = new Date();
  context.db
    .update(uploadSubmissions)
    .set({ lastActivityAt: now })
    .where(eq(uploadSubmissions.id, session.submissionId))
    .run();
}
export async function beginSession(
  context: UploadContext,
  id: string,
  origin: string | null,
) {
  const first = getSession(context.db, id);
  const storage = requireSessionStorage(context.db, first);
  if (storage.type === 's3') {
    const root = uploadTemporaryRoot(context);
    await mkdir(root, { recursive: true });
    const resources = context.resources ?? createMediaResources();
    resources.reserveWrite(`upload-${id}`, root, first.declaredSize);
    resources.releaseWrite(`upload-${id}`);
  }
  const session = context.db.transaction(
    (tx) => {
      const current = getSession(tx, id);
      if (current.state !== 'queued')
        throw new UploadError(
          'UPLOAD_STATE_CONFLICT',
          '该会话已经开始或终止',
          409,
          current.imageId,
        );
      const target = requireSessionStorage(tx, current);
      const siteOrigin = new URL(requireSiteSettings(tx).publicUrl).origin;
      const direct =
        target.type === 's3' &&
        target.corsStatus === 'passed' &&
        target.corsRevision === target.configRevision &&
        target.corsOrigin === siteOrigin &&
        origin === siteOrigin;
      const route =
        target.type === 'local' ? 'local' : direct ? 'direct' : 'relay';
      const routeReason =
        route === 'relay'
          ? '当前站点的跨域检测未通过或已失效，本次文件通过 Ariso 服务器上传到 S3。'
          : null;
      const now = new Date();
      tx.update(uploadSessions)
        .set({
          route,
          routeReason,
          state: 'receiving',
          ...(direct
            ? {
                temporaryKey: `uploads/${id}/${current.candidateImageId}`,
                cleanupStatus: 'pending' as const,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(uploadSessions.id, id))
        .run();
      tx.update(uploadSubmissions)
        .set({ lastActivityAt: now })
        .where(eq(uploadSubmissions.id, current.submissionId))
        .run();
      return getSession(tx, id);
    },
    { behavior: 'immediate' },
  );
  if (session.route !== 'direct')
    return { route: session.route!, reason: session.routeReason };
  let client: ReturnType<typeof uploadS3Storage> | undefined;
  try {
    client = uploadS3Storage(context, session.storageId);
    const signed = await client.signUpload(
      session.temporaryKey!,
      'application/octet-stream',
    );
    if (getSession(context.db, id).state !== 'receiving')
      throw new UploadError('UPLOAD_STATE_CONFLICT', '会话已经终止', 409);
    context.db
      .update(uploadSessions)
      .set({ signatureExpiresAt: signed.expiresAt })
      .where(eq(uploadSessions.id, id))
      .run();
    return {
      route: 'direct' as const,
      reason: null,
      upload: {
        url: signed.url,
        method: signed.method,
        headers: signed.headers,
        expiresAt: signed.expiresAt.toISOString(),
      },
    };
  } catch (error) {
    await failUpload(context, id, error);
    throw error;
  } finally {
    client?.destroy();
  }
}
export async function failUpload(
  context: UploadContext,
  id: string,
  error: unknown,
) {
  const current = getSession(context.db, id);
  if (current.state === 'accepted') return;
  context.db
    .update(uploadSessions)
    .set({
      state: ['cancelled', 'failed', 'expired'].includes(current.state)
        ? current.state
        : 'failed',
      errorCode:
        error instanceof Error && 'code' in error
          ? String(error.code)
          : 'UPLOAD_RECEIVE_FAILED',
      error: error instanceof Error ? error.message : String(error),
      cleanupStatus:
        current.temporaryKey || current.finalKey || current.temporaryPath
          ? 'pending'
          : 'none',
      updatedAt: new Date(),
    })
    .where(eq(uploadSessions.id, id))
    .run();
  try {
    await cleanupSession(context, id);
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], '上传失败且清理失败');
  }
}

/** HEAD and conditional GET identify the same bytes that conditional Copy freezes. */
export async function completeSession(
  context: UploadContext,
  id: string,
  signal: AbortSignal,
) {
  const initial = getSession(context.db, id);
  if (initial.state === 'accepted') return initial;
  if (initial.route !== 'direct' || initial.state !== 'receiving')
    throw new UploadError(
      'UPLOAD_STATE_CONFLICT',
      '会话不能完成直传',
      409,
      initial.imageId,
    );
  const root = uploadTemporaryRoot(context);
  // Absolute runtime workspaces must not become build-time asset globs.
  const workspace = `${root}${sep}upload-${id}`;
  const path = join(root, 'uploads', id, 'source');
  let client: ReturnType<typeof uploadS3Storage> | undefined;
  try {
    requireSessionStorage(context.db, initial);
    client = uploadS3Storage(context, initial.storageId);
    context.db
      .update(uploadSessions)
      .set({ state: 'validating', temporaryPath: path, updatedAt: new Date() })
      .where(eq(uploadSessions.id, id))
      .run();
    touchUpload(context, id);
    await mkdir(dirname(path), { recursive: true });
    const object = await client.inspectObject(initial.temporaryKey!, {
      signal,
    });
    signal.throwIfAborted();
    if (!object || !object.etag)
      throw new UploadError(
        'UPLOAD_OBJECT_MISSING',
        '临时对象尚不存在或没有 ETag',
        409,
      );
    const limit = context.db
      .select()
      .from(uploadSubmissions)
      .where(eq(uploadSubmissions.id, initial.submissionId))
      .get()!.maxFileBytes;
    context.db
      .update(uploadSessions)
      .set({
        sourceEtag: object.etag,
        temporaryBytes: object.size ?? null,
        confirmedAt: new Date(),
      })
      .where(eq(uploadSessions.id, id))
      .run();
    if (object.size !== initial.declaredSize || object.size > limit)
      throw new UploadError(
        'UPLOAD_SIZE_MISMATCH',
        'S3 实际字节数与声明不符或超过上限',
        400,
      );
    const read = await client.readObject(initial.temporaryKey!, {
      ifMatch: object.etag,
      signal,
    });
    const resources = context.resources ?? createMediaResources();
    let bytes = 0;
    try {
      resources.reserveWrite(`upload-${id}`, dirname(path), object.size);
      await pipeline(
        read.stream,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            try {
              if (bytes + chunk.length > object.size!)
                throw new UploadError(
                  'UPLOAD_SIZE_MISMATCH',
                  '条件读取字节数超过对象大小',
                  400,
                );
              resources.reserveWrite(
                `upload-${id}`,
                dirname(path),
                object.size! - bytes,
              );
              resources.consumeWrite(`upload-${id}`, chunk.length);
              bytes += chunk.length;
              callback(null, chunk);
            } catch (error) {
              callback(error as Error);
            }
          },
        }),
        createWriteStream(path, { flags: 'wx' }),
        { signal },
      );
      if (bytes !== object.size)
        throw new UploadError(
          'UPLOAD_SIZE_MISMATCH',
          '条件读取字节数与对象大小不符',
          400,
        );
    } finally {
      resources.releaseWrite(`upload-${id}`);
      read.stream.destroy();
    }
    signal.throwIfAborted();
    const facts = await identifyImageFile(path, workspace, signal);
    const key = `original/${initial.candidateImageId}.${facts.extension}`;
    requireSessionStorage(context.db, initial);
    context.db
      .update(uploadSessions)
      .set({
        state: 'finalizing',
        finalKey: key,
        byteSize: object.size,
        updatedAt: new Date(),
      })
      .where(eq(uploadSessions.id, id))
      .run();
    await client.copyObject(initial.temporaryKey!, key, object.etag, {
      signal,
    });
    signal.throwIfAborted();
    context.db
      .update(uploadSessions)
      .set({ finalBytes: object.size, confirmedAt: new Date() })
      .where(eq(uploadSessions.id, id))
      .run();
    await retainMediaInput(root, initial.candidateJobId!, path, facts);
    signal.throwIfAborted();
    const accepted = acceptSession(context.db, id, facts);
    return accepted;
  } catch (error) {
    await failUpload(context, id, error);
    throw error;
  } finally {
    client?.destroy();
    await rm(workspace, { recursive: true, force: true });
    await rm(dirname(path), { recursive: true, force: true });
  }
}

/** Relay uses the same admitted local file for PUT and the durable media input. */
export async function publishS3Session(
  context: UploadContext,
  id: string,
  path: string,
  facts: Awaited<ReturnType<typeof identifyImageFile>>,
  signal: AbortSignal,
) {
  const session = getSession(context.db, id);
  requireSessionStorage(context.db, session);
  const key = `original/${session.candidateImageId}.${facts.extension}`;
  context.db
    .update(uploadSessions)
    .set({ state: 'finalizing', finalKey: key, updatedAt: new Date() })
    .where(eq(uploadSessions.id, id))
    .run();
  const client = uploadS3Storage(context, session.storageId);
  try {
    await client.writeObject(key, createReadStream(path), {
      size: session.byteSize!,
      contentType: facts.mime,
      signal,
    });
    signal.throwIfAborted();
    context.db
      .update(uploadSessions)
      .set({ finalBytes: session.byteSize, confirmedAt: new Date() })
      .where(eq(uploadSessions.id, id))
      .run();
    await retainMediaInput(
      uploadTemporaryRoot(context),
      session.candidateJobId!,
      path,
      facts,
    );
    signal.throwIfAborted();
    return acceptSession(context.db, id, facts);
  } finally {
    client.destroy();
  }
}
