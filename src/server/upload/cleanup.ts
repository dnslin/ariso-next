import { and, eq, inArray, lte, or, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { terminateMediaTools } from '../media/tools.ts';
import { deleteObject } from '../storage/local.ts';
import { storageConfigs } from '../storage/schema.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';
import { getSession } from './sessions.ts';

export type UploadContext = { db: BetterSQLite3Database; storageRoot: string };

/** Called only once the active writer has settled. Never scan the storage directory. */
export async function cleanupSession(context: UploadContext, id: string) {
  const { db, storageRoot } = context;
  const session = getSession(db, id);
  if (session.state === 'accepted') return;
  const storage = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, session.storageId))
    .get()!;
  try {
    if (session.temporaryKey || session.finalKey)
      await terminateMediaTools(`${storageRoot}/upload-${id}`);
    for (const field of ['temporaryKey', 'finalKey'] as const) {
      const key = session[field];
      if (!key) continue;
      await deleteObject(storageRoot, storage, key);
      db.update(uploadSessions)
        .set({ [field]: null })
        .where(eq(uploadSessions.id, id))
        .run();
    }
    db.update(uploadSessions)
      .set({
        cleanupStatus: 'none',
        nextCleanupAt: null,
        updatedAt: new Date(),
      })
      .where(eq(uploadSessions.id, id))
      .run();
  } catch (error) {
    const attempts = session.cleanupAttempts + 1;
    db.update(uploadSessions)
      .set({
        cleanupStatus: attempts >= 3 ? 'failed' : 'pending',
        cleanupAttempts: attempts,
        nextCleanupAt: attempts >= 3 ? null : new Date(Date.now() + 60_000),
        error: `${session.error ?? ''}\n清理失败: ${error instanceof Error ? error.message : String(error)}`,
        updatedAt: new Date(),
      })
      .where(eq(uploadSessions.id, id))
      .run();
    throw error;
  }
}

/** Single-process startup: interrupted operations cannot have live writers. */
export function recoverUploadSessions(db: BetterSQLite3Database) {
  db.update(uploadSessions)
    .set({
      state: 'failed',
      errorCode: 'UPLOAD_INTERRUPTED',
      error: '接收或交接被进程重启中断',
      cleanupStatus: 'pending',
      updatedAt: new Date(),
    })
    .where(
      inArray(uploadSessions.state, ['receiving', 'validating', 'finalizing']),
    )
    .run();
}

export function expireQueuedSessions(
  db: BetterSQLite3Database,
  now = new Date(),
) {
  const expired = db
    .select({ id: uploadSubmissions.id })
    .from(uploadSubmissions)
    .where(
      lte(
        uploadSubmissions.lastActivityAt,
        new Date(now.getTime() - 3_600_000),
      ),
    )
    .all();
  for (const submission of expired) {
    db.update(uploadSessions)
      .set({
        state: 'expired',
        errorCode: 'UPLOAD_EXPIRED',
        error: '提交一小时内无上传活动',
        updatedAt: now,
      })
      .where(
        and(
          eq(uploadSessions.submissionId, submission.id),
          eq(uploadSessions.state, 'queued'),
        ),
      )
      .run();
  }
}

export function pendingCleanups(db: BetterSQLite3Database) {
  return db
    .select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(
      and(
        inArray(uploadSessions.state, ['failed', 'cancelled', 'expired']),
        eq(uploadSessions.cleanupStatus, 'pending'),
        or(
          isNull(uploadSessions.nextCleanupAt),
          lte(uploadSessions.nextCleanupAt, new Date()),
        ),
      ),
    )
    .all();
}
