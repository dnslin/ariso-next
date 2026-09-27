import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { prepareUploadSelection } from '../collections/memberships.ts';
import { mediaImages, mediaJobs } from '../media/schema.ts';
import { createProcessingSnapshot } from '../media/settings.ts';
import { resolveUploadStorage } from '../storage/defaults.ts';
import { UploadError } from './errors.ts';
import {
  uploadSettings,
  uploadSessions,
  uploadSubmissions,
  type UploadSession,
} from './schema.ts';
import { normalizeOriginalName, submissionInputSchema } from './validation.ts';

export function getSession(db: BetterSQLite3Database, id: string) {
  const session = db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, id))
    .get();
  if (!session)
    throw new UploadError('UPLOAD_SESSION_NOT_FOUND', '上传会话不存在', 404);
  return session;
}

export function getSubmission(db: BetterSQLite3Database, id: string) {
  return db.transaction((tx) => {
    const submission = tx
      .select()
      .from(uploadSubmissions)
      .where(eq(uploadSubmissions.id, id))
      .get();
    if (!submission)
      throw new UploadError(
        'UPLOAD_SUBMISSION_NOT_FOUND',
        '上传提交不存在',
        404,
      );
    const sessions = tx
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.submissionId, id))
      .orderBy(asc(uploadSessions.groupIndex), asc(uploadSessions.createdAt))
      .all()
      .map((session) => ({
        ...session,
        image: session.imageId
          ? (tx
              .select()
              .from(mediaImages)
              .where(eq(mediaImages.id, session.imageId))
              .get() ?? null)
          : null,
        job: session.jobId
          ? (tx
              .select()
              .from(mediaJobs)
              .where(eq(mediaJobs.id, session.jobId))
              .get() ?? null)
          : null,
      }));
    return { ...submission, sessions };
  });
}

export function requireSessionStorage(
  db: BetterSQLite3Database,
  session: UploadSession,
) {
  return resolveUploadStorage(db, session.storageId);
}

export function createSubmission(db: BetterSQLite3Database, input: unknown) {
  const parsed = submissionInputSchema.safeParse(input);
  if (!parsed.success)
    throw new UploadError('UPLOAD_INVALID_INPUT', parsed.error.message);
  const data = {
    ...parsed.data,
    files: parsed.data.files.map((file) => ({
      ...file,
      originalName: normalizeOriginalName(file.originalName),
    })),
    albumIds: [...new Set(parsed.data.albumIds)].sort(),
    tagIds: [...new Set(parsed.data.tagIds)].sort(),
  };
  const requestInput = JSON.stringify(data);
  return db.transaction(
    (tx) => {
      const existing = tx
        .select()
        .from(uploadSubmissions)
        .where(eq(uploadSubmissions.requestId, data.requestId))
        .get();
      if (existing) {
        if (existing.requestInput !== requestInput)
          throw new UploadError(
            'UPLOAD_REQUEST_CONFLICT',
            '同一请求 ID 的上传参数不同',
            409,
          );
        return getSubmission(tx, existing.id);
      }
      const settings = tx
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
      if (data.files.length > settings.queueLimit)
        throw new UploadError('UPLOAD_QUEUE_LIMIT', '提交文件数量超过队列上限');
      if (data.files.some((file) => file.declaredSize > settings.maxFileBytes))
        throw new UploadError(
          'UPLOAD_FILE_TOO_LARGE',
          '文件大小超过上传上限',
          413,
        );
      const storage = resolveUploadStorage(tx, data.storageId);
      const selection = prepareUploadSelection(tx, data);
      const snapshot = createProcessingSnapshot(tx);
      const id = randomUUID();
      const now = new Date();
      tx.insert(uploadSubmissions)
        .values({
          id,
          requestId: data.requestId,
          requestInput,
          source: 'web',
          storageId: storage.id,
          visibility: data.visibility ?? snapshot.defaultVisibility,
          snapshot,
          albumIds: [...selection.albumIds],
          tagIds: [...selection.tagIds],
          maxFileBytes: settings.maxFileBytes,
          batchSize: settings.batchSize,
          queueLimit: settings.queueLimit,
          lastActivityAt: now,
          createdAt: now,
        })
        .run();
      for (const [index, file] of data.files.entries()) {
        tx.insert(uploadSessions)
          .values({
            id: randomUUID(),
            submissionId: id,
            ...file,
            groupIndex: Math.floor(index / settings.batchSize),
            storageId: storage.id,
            state: 'queued',
            candidateImageId: randomUUID(),
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
      return getSubmission(tx, id);
    },
    { behavior: 'immediate' },
  );
}

/** The receiver settles in-flight writes before deleting registered object keys. */
export function cancelSession(db: BetterSQLite3Database, id: string) {
  return db.transaction(
    (tx) => {
      const session = getSession(tx, id);
      if (session.state === 'accepted')
        throw new UploadError(
          'UPLOAD_ALREADY_ACCEPTED',
          '图片已交给服务端处理，不能取消',
          409,
          session.imageId,
        );
      if (['cancelled', 'failed', 'expired'].includes(session.state))
        return session;
      const now = new Date();
      return tx
        .update(uploadSessions)
        .set({
          state: 'cancelled',
          cleanupStatus:
            session.temporaryKey || session.finalKey ? 'pending' : 'none',
          nextCleanupAt: session.temporaryKey || session.finalKey ? now : null,
          updatedAt: now,
        })
        .where(eq(uploadSessions.id, id))
        .returning()
        .get()!;
    },
    { behavior: 'immediate' },
  );
}
