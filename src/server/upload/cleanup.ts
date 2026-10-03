import { rm } from 'node:fs/promises';
import { dirname, sep } from 'node:path';
import { discardMediaInput } from '../media/input.ts';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import type { createMediaResources } from '../media/resources.ts';
import { uploadS3Storage } from './s3.ts';
import { requireLocalStorage } from '../storage/settings.ts';
import {
  and,
  eq,
  inArray,
  lte,
  or,
  isNull,
  notInArray,
  ne,
  isNotNull,
  gt,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { terminateMediaTools } from '../media/tools.ts';
import { deleteObject } from '../storage/local.ts';
import { storageConfigs } from '../storage/schema.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';
import { getSession } from './sessions.ts';

export type UploadContext = {
  db: BetterSQLite3Database;
  storageRoot: string;
  temporaryRoot?: string;
  secretCrypto?: ReturnType<typeof createSecretCrypto>;
  resources?: ReturnType<typeof createMediaResources>;
};

/** Called only once the active writer has settled. Never scan the storage directory. */
export async function cleanupSession(context: UploadContext, id: string) {
  const { db, storageRoot } = context;
  const session = getSession(db, id);
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
      if (storage.type === 'local') {
        requireLocalStorage(storage);
        await deleteObject(storageRoot, storage, key);
      } else {
        const client = uploadS3Storage(context, session.storageId);
        try {
          await client.deleteObject(key, {
            signal: AbortSignal.timeout(30_000),
          });
        } finally {
          client.destroy();
        }
      }
      db.update(uploadSessions)
        .set({
          [field]: null,
          [field === 'temporaryKey' ? 'temporaryBytes' : 'finalBytes']: null,
        })
        .where(eq(uploadSessions.id, id))
        .run();
    }
    if (context.temporaryRoot) {
      const workspace = `${context.temporaryRoot}${sep}upload-${id}`;
      await terminateMediaTools(workspace);
      await rm(workspace, {
        recursive: true,
        force: true,
      });
      if (session.temporaryPath)
        await rm(dirname(session.temporaryPath), {
          recursive: true,
          force: true,
        });
      if (session.state !== 'accepted' && session.candidateJobId)
        await discardMediaInput(context.temporaryRoot, session.candidateJobId);
    }
    db.update(uploadSessions)
      .set({
        temporaryPath: null,
        cleanupStatus: 'none',
        error: session.error?.split('\n清理失败:')[0] || null,
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

export function expireUploadSessions(
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
    );
  db.update(uploadSessions)
    .set({
      state: 'expired',
      errorCode: 'UPLOAD_EXPIRED',
      error: '提交一小时内无上传活动',
      cleanupStatus: 'pending',
      nextCleanupAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(uploadSessions.state, [
          'queued',
          'receiving',
          'validating',
          'finalizing',
        ]),
        inArray(uploadSessions.submissionId, expired),
      ),
    )
    .run();
}

export function pendingCleanups(db: BetterSQLite3Database) {
  return db
    .select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(
      and(
        inArray(uploadSessions.state, [
          'accepted',
          'failed',
          'cancelled',
          'expired',
        ]),
        eq(uploadSessions.cleanupStatus, 'pending'),
        or(
          isNull(uploadSessions.nextCleanupAt),
          lte(uploadSessions.nextCleanupAt, new Date()),
        ),
      ),
    )
    .all();
}

/** SPEC-upload §5: keep a whole submission while any result or cleanup is still active. */
export function purgeUploadResults(
  db: BetterSQLite3Database,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 86_400_000);
  db.transaction((tx) => {
    const retained = tx
      .select({ id: uploadSessions.submissionId })
      .from(uploadSessions)
      .where(
        or(
          notInArray(uploadSessions.state, [
            'accepted',
            'failed',
            'cancelled',
            'expired',
          ]),
          ne(uploadSessions.cleanupStatus, 'none'),
          isNotNull(uploadSessions.temporaryKey),
          isNotNull(uploadSessions.finalKey),
          isNotNull(uploadSessions.temporaryPath),
          gt(uploadSessions.updatedAt, cutoff),
        ),
      );
    const expired = tx
      .selectDistinct({ id: uploadSessions.submissionId })
      .from(uploadSessions)
      .where(
        and(
          lte(uploadSessions.updatedAt, cutoff),
          notInArray(uploadSessions.submissionId, retained),
        ),
      )
      .all()
      .map((submission) => submission.id);
    if (!expired.length) return;
    tx.delete(uploadSessions)
      .where(
        and(
          inArray(uploadSessions.submissionId, expired),
          lte(uploadSessions.updatedAt, cutoff),
        ),
      )
      .run();
    tx.delete(uploadSubmissions)
      .where(inArray(uploadSubmissions.id, expired))
      .run();
  });
}
