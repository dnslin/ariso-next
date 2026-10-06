import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import {
  cleanupSession,
  expireUploadSessions,
  purgeUploadResults,
  recoverUploadSessions,
} from '../../../src/server/upload/cleanup.ts';
import {
  cancelSession,
  createSubmission,
  getPreparedSession,
  getSession,
  getSubmission,
  requireSessionStorage,
} from '../../../src/server/upload/sessions.ts';
import { receiveSession } from '../../../src/server/upload/receive.ts';
import { acceptSession } from '../../../src/server/upload/accept.ts';
import {
  uploadSessions,
  uploadSettings,
  sessionStates,
} from '../../../src/server/upload/schema.ts';
import {
  readUploadReferences,
  readUploadUsage,
  releaseStorageHistory,
} from '../../../src/server/upload/usage.ts';
import {
  storageConfigs,
  storageSettings,
} from '../../../src/server/storage/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  fixture.close();
});

function receipt(values: Partial<typeof uploadSessions.$inferInsert> = {}) {
  const id = randomUUID();
  const now = new Date();
  fixture.db
    .insert(uploadSessions)
    .values({
      id,
      queueItemId: id,
      groupIndex: 0,
      originalName: 'incoming.png',
      declaredSize: 0,
      state: 'receiving',
      candidateImageId: randomUUID(),
      candidateJobId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...values,
    })
    .run();
  return getSession(fixture.db, id);
}

function webSubmission() {
  return createSubmission(fixture.db, {
    requestId: randomUUID(),
    files: [{ queueItemId: 'file', originalName: 'web.png', declaredSize: 10 }],
  });
}

describe('API receipts before submission and storage preparation', () => {
  it('keeps an unprepared row readable while prepared operations reject without choosing the default storage', async () => {
    const { db } = fixture;
    const session = receipt();
    expect(session).toMatchObject({ submissionId: null, storageId: null });
    const conflict = expect.objectContaining({
      code: 'UPLOAD_STATE_CONFLICT',
      status: 409,
    });
    expect(() => getPreparedSession(db, session.id)).toThrow(conflict);
    expect(() => requireSessionStorage(db, session)).toThrow(conflict);
    await expect(
      receiveSession(
        fixture,
        session.id,
        new Request('http://localhost/api/uploads', { method: 'POST' }),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_STATE_CONFLICT', status: 409 });
    expect(() =>
      acceptSession(db, session.id, {
        format: 'PNG',
        mime: 'image/png',
        extension: 'png',
        coder: 'png',
        width: null,
        height: null,
      }),
    ).toThrow(conflict);
    expect(getSession(db, session.id)).toEqual(session);

    const submission = webSubmission();
    db.update(uploadSessions)
      .set({
        submissionId: submission.id,
        storageId: fixture.storage.id,
        declaredSize: 10,
      })
      .where(eq(uploadSessions.id, session.id))
      .run();
    expect(getPreparedSession(db, session.id)).toMatchObject({
      submissionId: submission.id,
      storageId: fixture.storage.id,
      declaredSize: 10,
    });
    expect(getSubmission(db, submission.id).sessions).toHaveLength(2);
  });

  it('recovers interrupted tmp reception and deletes only its registered workspace without a storage reference', async () => {
    const { db, storageRoot } = fixture;
    const temporaryRoot = join(storageRoot, 'tmp');
    const session = receipt();
    const path = join(temporaryRoot, 'uploads', session.id, 'source');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'partial upload');
    db.update(uploadSessions)
      .set({ temporaryPath: path, cleanupStatus: 'pending' })
      .where(eq(uploadSessions.id, session.id))
      .run();
    const storageBefore = db.select().from(storageConfigs).all();
    expect(readUploadReferences(db)).toEqual([]);
    expect(readUploadUsage(db)).toEqual([]);
    recoverUploadSessions(db);
    expect(getSession(db, session.id)).toMatchObject({
      state: 'failed',
      errorCode: 'UPLOAD_INTERRUPTED',
      cleanupStatus: 'pending',
    });
    await cleanupSession({ db, storageRoot, temporaryRoot }, session.id);
    await expect(stat(dirname(path))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(getSession(db, session.id)).toMatchObject({
      submissionId: null,
      storageId: null,
      temporaryPath: null,
      cleanupStatus: 'none',
      errorCode: 'UPLOAD_INTERRUPTED',
    });
    expect(db.select().from(storageConfigs).all()).toEqual(storageBefore);
  });

  it('expires unattached pre-accept receipts at the one-hour updatedAt boundary and retains newer activity and terminal rows', () => {
    const { db } = fixture;
    const now = new Date();
    const cutoff = new Date(now.getTime() - 3_600_000);
    const sessions = sessionStates.map((state) =>
      receipt({ state, updatedAt: cutoff }),
    );
    const recent = receipt({ updatedAt: new Date(cutoff.getTime() + 1) });
    expireUploadSessions(db, now);
    for (const session of sessions)
      expect(getSession(db, session.id).state).toBe(
        ['queued', 'receiving', 'validating', 'finalizing'].includes(
          session.state,
        )
          ? 'expired'
          : session.state,
      );
    expect(getSession(db, recent.id).state).toBe('receiving');
    expect(readUploadReferences(db)).toEqual([]);
  });

  it('purges cleaned unattached terminal results at 24 hours and preserves every live or cleanup responsibility', () => {
    const { db } = fixture;
    const now = new Date();
    const cutoff = new Date(now.getTime() - 86_400_000);
    const old = receipt({ state: 'failed', updatedAt: cutoff });
    const retained = [
      receipt({ state: 'failed', updatedAt: new Date(cutoff.getTime() + 1) }),
      receipt({ state: 'queued', updatedAt: cutoff }),
      receipt({ state: 'failed', cleanupStatus: 'pending', updatedAt: cutoff }),
      receipt({ state: 'failed', cleanupStatus: 'failed', updatedAt: cutoff }),
      receipt({
        state: 'failed',
        temporaryPath: '/controlled/tmp/source',
        updatedAt: cutoff,
      }),
    ];
    const web = webSubmission();
    db.update(uploadSessions)
      .set({ state: 'failed', updatedAt: cutoff })
      .where(eq(uploadSessions.submissionId, web.id))
      .run();
    purgeUploadResults(db, now);
    expect(() => getSession(db, old.id)).toThrow(
      expect.objectContaining({ code: 'UPLOAD_SESSION_NOT_FOUND' }),
    );
    expect(() => getSubmission(db, web.id)).toThrow(
      expect.objectContaining({ code: 'UPLOAD_SUBMISSION_NOT_FOUND' }),
    );
    expect(
      db
        .select()
        .from(uploadSessions)
        .all()
        .map((s) => s.id)
        .sort(),
    ).toEqual(retained.map((s) => s.id).sort());
  });

  it('acquires deletion ownership before reading so a concurrent connection cannot invalidate orphan cleanup', () => {
    const { db } = fixture;
    const now = new Date();
    const cutoff = new Date(now.getTime() - 86_400_000);
    const old = receipt({ state: 'failed', updatedAt: cutoff });
    const retained = receipt({
      state: 'failed',
      cleanupStatus: 'pending',
      temporaryPath: '/controlled/tmp/owned-source',
      updatedAt: cutoff,
    });
    const second = openRuntimeDatabase(db.$client.name);
    second.db.$client.pragma('busy_timeout = 0');
    let attempted = false;
    let concurrentFailure: unknown;
    const observed = drizzle(db.$client, {
      logger: {
        logQuery(query) {
          if (attempted || !query.startsWith('delete')) return;
          attempted = true;
          try {
            second.db.transaction(
              (tx) => tx.update(uploadSettings).set({ batchSize: 1 }).run(),
              { behavior: 'immediate' },
            );
          } catch (error) {
            concurrentFailure = error;
          }
        },
      },
    });
    try {
      expect(() => purgeUploadResults(observed, now)).not.toThrow();
      expect(attempted).toBe(true);
      expect(concurrentFailure).toMatchObject({ code: 'SQLITE_BUSY' });
      expect(() => getSession(db, old.id)).toThrow(
        expect.objectContaining({ code: 'UPLOAD_SESSION_NOT_FOUND' }),
      );
      expect(getSession(db, retained.id)).toEqual(retained);
    } finally {
      second.close();
    }
  });

  it('does not let an unattached tmp receipt retain unrelated empty-storage history or block deletion', () => {
    const { db, storage } = fixture;
    const api = receipt({
      temporaryPath: '/controlled/tmp/incoming',
      cleanupStatus: 'pending',
    });
    const web = webSubmission();
    cancelSession(db, web.sessions[0].id);
    expect(readUploadReferences(db)).toEqual([]);
    expect(readUploadUsage(db)).toEqual([]);
    releaseStorageHistory(db, storage.id);
    expect(() => getSubmission(db, web.id)).toThrow(
      expect.objectContaining({ code: 'UPLOAD_SUBMISSION_NOT_FOUND' }),
    );
    expect(getSession(db, api.id)).toEqual(api);
    db.update(storageSettings).set({ defaultStorageId: null }).run();
    expect(() =>
      db.delete(storageConfigs).where(eq(storageConfigs.id, storage.id)).run(),
    ).not.toThrow();
  });
});
