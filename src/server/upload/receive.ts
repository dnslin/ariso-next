import { createMediaResources } from '../media/resources.ts';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { publishS3Session, failUpload, uploadTemporaryRoot } from './s3.ts';
import { eq } from 'drizzle-orm';
import { identifyImageFile } from '../media/file-formats.ts';
import {
  prepareLocalObjectPath,
  publishLocalObject,
} from '../storage/local.ts';
import { acceptSession } from './accept.ts';
import { type UploadContext } from './cleanup.ts';
import { UploadError } from './errors.ts';
import { receiveMultipart } from './multipart.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';
import { getPreparedSession, requireSessionStorage } from './sessions.ts';

/** The runtime owns cancellation; request disconnect applies only while reading bytes. */
export async function receiveSession(
  context: UploadContext,
  id: string,
  request: Request,
  signal: AbortSignal,
) {
  const { db, storageRoot } = context;
  const initial = getPreparedSession(db, id);
  if (
    initial.route === 'direct' ||
    (initial.state !== 'queued' &&
      !(
        initial.state === 'receiving' &&
        !initial.temporaryKey &&
        !initial.temporaryPath
      ))
  )
    throw new UploadError(
      'UPLOAD_STATE_CONFLICT',
      '会话不能重复写入或改用中转',
      409,
      initial.imageId,
    );
  try {
    const session = db.transaction(
      (tx) => {
        const current = getPreparedSession(tx, id);
        if (
          current.state !== 'queued' &&
          !(
            current.state === 'receiving' &&
            current.route !== 'direct' &&
            !current.temporaryKey &&
            !current.temporaryPath
          )
        )
          throw new UploadError(
            'UPLOAD_STATE_CONFLICT',
            '该会话已经开始或终止，不能重复写入',
            409,
            current.imageId,
          );
        const target = requireSessionStorage(tx, current);
        if (current.route === 'direct')
          throw new UploadError(
            'UPLOAD_STATE_CONFLICT',
            '直传会话不能改用中转',
            409,
          );
        const now = new Date();
        tx.update(uploadSessions)
          .set({
            state: 'receiving',
            route: target.type === 'local' ? 'local' : 'relay',
            temporaryKey:
              target.type === 'local' ? `uploads/${id}.partial` : null,
            temporaryPath:
              target.type === 's3'
                ? join(uploadTemporaryRoot(context), 'uploads', id, 'source')
                : null,
            cleanupStatus: 'pending',
            updatedAt: now,
          })
          .where(eq(uploadSessions.id, id))
          .run();
        tx.update(uploadSubmissions)
          .set({ lastActivityAt: now })
          .where(eq(uploadSubmissions.id, current.submissionId))
          .run();
        return getPreparedSession(tx, id);
      },
      { behavior: 'immediate' },
    );
    const submission = db
      .select()
      .from(uploadSubmissions)
      .where(eq(uploadSubmissions.id, session.submissionId))
      .get()!;
    const storage = requireSessionStorage(db, session);
    const path =
      storage.type === 'local'
        ? prepareLocalObjectPath(
            storageRoot,
            { ...storage, localPath: storage.localPath! },
            session.temporaryKey!,
          )
        : session.temporaryPath!;
    await mkdir(dirname(path), { recursive: true });
    let lastProgress = Date.now();
    const { byteSize } = await receiveMultipart(request, {
      path,
      resources: (context.resources ??= createMediaResources()),
      maxBytes: submission.maxFileBytes,
      declaredSize: session.declaredSize,
      signal,
      onProgress(bytes) {
        if (Date.now() - lastProgress < 60_000) return;
        lastProgress = Date.now();
        const now = new Date();
        db.update(uploadSessions)
          .set({ byteSize: bytes, updatedAt: now })
          .where(eq(uploadSessions.id, id))
          .run();
        db.update(uploadSubmissions)
          .set({ lastActivityAt: now })
          .where(eq(uploadSubmissions.id, session.submissionId))
          .run();
      },
    });
    signal.throwIfAborted();
    db.update(uploadSessions)
      .set({
        state: 'validating',
        byteSize,
        temporaryBytes: storage.type === 'local' ? byteSize : null,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(uploadSessions.id, id))
      .run();
    // Signature admission does not decode; the durable media job classifies and renders.
    const facts = await identifyImageFile(
      path,
      `${storage.type === 's3' ? uploadTemporaryRoot(context) : storageRoot}${sep}upload-${id}`,
      signal,
    );
    const { extension } = facts;
    if (storage.type === 's3') {
      const result = await publishS3Session(context, id, path, facts, signal);
      await rm(dirname(path), { recursive: true, force: true });
      return result;
    }
    signal.throwIfAborted();
    const finalKey = `original/${session.candidateImageId}.${extension}`;
    db.update(uploadSessions)
      .set({ state: 'finalizing', finalKey, updatedAt: new Date() })
      .where(eq(uploadSessions.id, id))
      .run();
    await publishLocalObject(
      storageRoot,
      { ...requireSessionStorage(db, session), localPath: storage.localPath! },
      session.temporaryKey!,
      finalKey,
    );
    signal.throwIfAborted();
    return acceptSession(db, id, facts);
  } catch (error) {
    await failUpload(context, id, error);
    throw error;
  }
}
