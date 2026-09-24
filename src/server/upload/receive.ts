import { eq } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import { inspectImage, requireFirstImageFormat } from '../media/formats.ts';
import {
  prepareLocalObjectPath,
  publishLocalObject,
} from '../storage/local.ts';
import { acceptSession } from './accept.ts';
import { cleanupSession, type UploadContext } from './cleanup.ts';
import { UploadError } from './errors.ts';
import { receiveMultipart } from './multipart.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';
import { getSession, requireSessionStorage } from './sessions.ts';

/** The runtime owns cancellation; request disconnect applies only while reading bytes. */
export async function receiveSession(
  context: UploadContext,
  id: string,
  request: Request,
  signal: AbortSignal,
) {
  const { db, storageRoot } = context;
  const session = db.transaction(
    (tx) => {
      const current = getSession(tx, id);
      if (current.state !== 'queued')
        throw new UploadError(
          'UPLOAD_STATE_CONFLICT',
          '该会话已经开始或终止，不能重复写入',
          409,
          current.imageId,
        );
      requireSessionStorage(tx, current);
      const now = new Date();
      tx.update(uploadSessions)
        .set({
          state: 'receiving',
          temporaryKey: `uploads/${id}.partial`,
          cleanupStatus: 'pending',
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
  try {
    const submission = db
      .select()
      .from(uploadSubmissions)
      .where(eq(uploadSubmissions.id, session.submissionId))
      .get()!;
    const storage = requireSessionStorage(db, session);
    const path = prepareLocalObjectPath(
      storageRoot,
      storage,
      session.temporaryKey!,
    );
    let lastProgress = Date.now();
    const { byteSize } = await receiveMultipart(request, {
      path,
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
      .set({ state: 'validating', byteSize, updatedAt: new Date() })
      .where(eq(uploadSessions.id, id))
      .run();
    // ExifTool streams the original; no full-file Buffer or second disk copy.
    const facts = await inspectImage(
      createReadStream(path),
      `${storageRoot}/upload-${id}`,
      signal,
    );
    const extension = requireFirstImageFormat(facts);
    signal.throwIfAborted();
    const finalKey = `original/${session.candidateImageId}.${extension}`;
    db.update(uploadSessions)
      .set({ state: 'finalizing', finalKey, updatedAt: new Date() })
      .where(eq(uploadSessions.id, id))
      .run();
    await publishLocalObject(
      storageRoot,
      requireSessionStorage(db, session),
      session.temporaryKey!,
      finalKey,
    );
    signal.throwIfAborted();
    const accepted = acceptSession(db, id, facts);
    db.update(uploadSubmissions)
      .set({ lastActivityAt: new Date() })
      .where(eq(uploadSubmissions.id, session.submissionId))
      .run();
    return accepted;
  } catch (error) {
    const current = getSession(db, id);
    if (current.state !== 'accepted') {
      const code =
        error instanceof Error && 'code' in error
          ? String(error.code)
          : 'UPLOAD_RECEIVE_FAILED';
      db.update(uploadSessions)
        .set({
          state: current.state === 'cancelled' ? 'cancelled' : 'failed',
          errorCode: code,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(uploadSessions.id, id))
        .run();
      try {
        await cleanupSession(context, id);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          '上传失败且文件清理失败',
        );
      }
    }
    throw error;
  }
}
