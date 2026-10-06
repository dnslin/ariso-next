import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { finished } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import { prepareUploadSelection } from '../collections/memberships.ts';
import { identifyImageFile } from '../media/file-formats.ts';
import { analyzeMediaError } from '../media/errors.ts';
import { writeReceivedFile } from '../media/file-write.ts';
import { createMediaResources } from '../media/resources.ts';
import { createProcessingSnapshot } from '../media/settings.ts';
import { resolveUploadStorage } from '../storage/defaults.ts';
import {
  prepareLocalObjectPath,
  publishLocalObject,
} from '../storage/local.ts';
import { acceptSession } from './accept.ts';
import type { UploadContext } from './cleanup.ts';
import { UploadError } from './errors.ts';
import { receiveMultipart } from './multipart.ts';
import { publicUploadFieldsSchema } from './public-contract.ts';
import { uploadSettings, uploadSessions, uploadSubmissions } from './schema.ts';
import {
  getSession,
  getPreparedSession,
  requireSessionStorage,
} from './sessions.ts';
import { failUpload, publishS3Session, uploadTemporaryRoot } from './s3.ts';
import { normalizeOriginalName } from './validation.ts';

/** Register tmp ownership before any body bytes; target and snapshot do not exist yet. */
export function createPublicReceipt(context: UploadContext) {
  const id = randomUUID();
  const now = new Date();
  context.db
    .insert(uploadSessions)
    .values({
      id,
      queueItemId: id,
      groupIndex: 0,
      originalName: 'image',
      declaredSize: 0,
      state: 'receiving',
      candidateImageId: randomUUID(),
      candidateJobId: randomUUID(),
      temporaryPath: join(
        uploadTemporaryRoot(context),
        'uploads',
        id,
        'source',
      ),
      cleanupStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export async function receivePublicSession(
  context: UploadContext,
  id: string,
  request: Request,
  signal: AbortSignal,
  tokenId: string,
) {
  const { db } = context;
  let stage = 'receiving';
  try {
    const initial = getSession(db, id);
    if (
      initial.submissionId ||
      initial.storageId ||
      initial.state !== 'receiving' ||
      !initial.temporaryPath
    )
      throw new UploadError(
        'UPLOAD_STATE_CONFLICT',
        '公共上传接收会话不可重复使用',
        409,
      );
    const settings = db
      .select()
      .from(uploadSettings)
      .where(eq(uploadSettings.id, 1))
      .get();
    if (!settings)
      throw new UploadError(
        'UPLOAD_NOT_INITIALIZED',
        '上传设置尚未初始化',
        409,
      );
    // Only the size limit is frozen before parsing; other settings belong to the preparation transaction.
    const maxFileBytes = settings.maxFileBytes;
    const path = initial.temporaryPath;
    await mkdir(dirname(path), { recursive: true });
    let originalName = 'image';
    let declaredMime: string | null = null;
    const fields: Record<string, string | string[]> = { albumId: [], tag: [] };
    let lastProgress = Date.now();
    const { byteSize } = await receiveMultipart(request, {
      path,
      resources: (context.resources ??= createMediaResources()),
      maxBytes: maxFileBytes,
      signal,
      onFile(info) {
        originalName = normalizeOriginalName(info.filename ?? '');
        declaredMime = info.mimeType;
      },
      onField(name, value) {
        if (name === 'albumId' || name === 'tag') {
          (fields[name] as string[]).push(value);
        } else if (name === 'storageId' || name === 'visibility') {
          if (Object.hasOwn(fields, name))
            throw new UploadError(
              'UPLOAD_DUPLICATE_FIELD',
              `字段不可重复: ${name}`,
            );
          fields[name] = value;
        } else
          throw new UploadError('UPLOAD_UNKNOWN_FIELD', `未知字段: ${name}`);
      },
      onProgress(bytes) {
        if (Date.now() - lastProgress < 60_000) return;
        lastProgress = Date.now();
        db.update(uploadSessions)
          .set({ byteSize: bytes, updatedAt: new Date() })
          .where(eq(uploadSessions.id, id))
          .run();
      },
    });
    signal.throwIfAborted();
    stage = 'preparing';
    const parsed = publicUploadFieldsSchema.safeParse(fields);
    if (!parsed.success)
      throw new UploadError('UPLOAD_INVALID_INPUT', parsed.error.message);
    const session = db.transaction(
      (tx) => {
        if (getSession(tx, id).state !== 'receiving')
          throw new UploadError(
            'UPLOAD_STATE_CONFLICT',
            '接收会话已经终止',
            409,
          );
        const storage = resolveUploadStorage(tx, parsed.data.storageId);
        const selection = prepareUploadSelection(tx, {
          albumIds: parsed.data.albumId,
          tagNames: parsed.data.tag,
        });
        const snapshot = createProcessingSnapshot(tx);
        const now = new Date();
        const submissionId = randomUUID();
        const currentSettings = tx
          .select()
          .from(uploadSettings)
          .where(eq(uploadSettings.id, 1))
          .get()!;
        tx.insert(uploadSubmissions)
          .values({
            id: submissionId,
            requestId: randomUUID(),
            requestInput: JSON.stringify(parsed.data),
            source: 'api',
            apiTokenId: tokenId,
            storageId: storage.id,
            visibility: parsed.data.visibility ?? snapshot.defaultVisibility,
            snapshot,
            albumIds: [...selection.albumIds],
            tagIds: [...selection.tagIds],
            maxFileBytes,
            batchSize: currentSettings.batchSize,
            queueLimit: currentSettings.queueLimit,
            lastActivityAt: now,
            createdAt: now,
          })
          .run();
        tx.update(uploadSessions)
          .set({
            submissionId,
            storageId: storage.id,
            route: storage.type === 'local' ? 'local' : 'relay',
            originalName,
            declaredSize: byteSize,
            declaredMime,
            byteSize,
            state: 'validating',
            updatedAt: now,
          })
          .where(eq(uploadSessions.id, id))
          .run();
        return getPreparedSession(tx, id);
      },
      { behavior: 'immediate' },
    );
    stage = 'validating';
    const root = uploadTemporaryRoot(context);
    const workspace = `${root}${sep}upload-${id}`;
    const facts = await identifyImageFile(path, workspace, signal).catch(
      (error: Error) => {
        throw Object.assign(error, { code: analyzeMediaError(error).code });
      },
    );
    signal.throwIfAborted();
    const storage = requireSessionStorage(db, session);
    stage = 'finalizing';
    if (storage.type === 's3') {
      const accepted = await publishS3Session(context, id, path, facts, signal);
      return getPreparedSession(db, accepted.id);
    }
    const temporaryKey = `uploads/${id}.partial`;
    const finalKey = `original/${session.candidateImageId}.${facts.extension}`;
    db.update(uploadSessions)
      .set({
        state: 'finalizing',
        temporaryKey,
        finalKey,
        updatedAt: new Date(),
      })
      .where(eq(uploadSessions.id, id))
      .run();
    const local = { ...storage, localPath: storage.localPath! };
    const target = prepareLocalObjectPath(
      context.storageRoot,
      local,
      temporaryKey,
    );
    // Streaming copy also handles tmp and storage living on different filesystems.
    const source = createReadStream(path);
    const sourceClosed = finished(source, { cleanup: true });
    // Observe errors before the target opens; pipeline still reports reception failure.
    void sourceClosed.catch(() => undefined);
    try {
      await writeReceivedFile(source, {
        path: target,
        resources: context.resources!,
        maxBytes: maxFileBytes,
        declaredSize: byteSize,
        signal,
        sizeError: () =>
          new UploadError('UPLOAD_SIZE_MISMATCH', '本地发布字节数与接收不符'),
        mapError: (error) => error,
        onFailure: () => undefined, // The writer propagates the same error to this operation.
        onProgress: () => undefined,
      });
    } finally {
      source.destroy();
      // Disposal can repeat the operation error or report early close after destroy.
      await sourceClosed.catch(() => undefined);
    }
    signal.throwIfAborted();
    requireSessionStorage(db, session);
    await publishLocalObject(
      context.storageRoot,
      local,
      temporaryKey,
      finalKey,
    );
    signal.throwIfAborted();
    db.update(uploadSessions)
      .set({ finalBytes: byteSize, confirmedAt: new Date() })
      .where(eq(uploadSessions.id, id))
      .run();
    const accepted = acceptSession(db, id, facts);
    return getPreparedSession(db, accepted.id);
  } catch (error) {
    try {
      await failUpload(context, id, error);
    } catch (cleanupError) {
      throw Object.assign(
        new AggregateError([error, cleanupError], '公共上传失败且清理失败'),
        { stage },
      );
    }
    throw Object.assign(
      error instanceof Error ? error : new Error(String(error)),
      { stage },
    );
  }
}
