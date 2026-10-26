import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { attachAcceptedImage } from '../collections/memberships.ts';
import { acceptOriginal } from '../media/images.ts';
import type { identifyImageFile } from '../media/file-formats.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';
import { getPreparedSession, requireSessionStorage } from './sessions.ts';
import { UploadError } from './errors.ts';
import { findDuplicateImage } from '../media/duplicates.ts';

/** The same short write transaction owns both duplicate detection and final acceptance. */
export function finishDuplicateSession(db: BetterSQLite3Database, id: string) {
  return db.transaction(
    (tx) => {
      const session = getPreparedSession(tx, id);
      if (session.state === 'duplicate') return session;
      if (
        !['validating', 'finalizing'].includes(session.state) ||
        !session.sourceSha256
      )
        return null;
      const existing = findDuplicateImage(tx, session.sourceSha256);
      if (!existing) return null;
      const now = new Date();
      tx.update(uploadSessions)
        .set({
          state: 'duplicate',
          existingImageId: existing.id,
          existingImageTrashed: existing.trashedAt !== null,
          cleanupStatus: 'pending',
          nextCleanupAt: now,
          updatedAt: now,
        })
        .where(eq(uploadSessions.id, id))
        .run();
      tx.update(uploadSubmissions)
        .set({ lastActivityAt: now })
        .where(eq(uploadSubmissions.id, session.submissionId))
        .run();
      return getPreparedSession(tx, id);
    },
    { behavior: 'immediate' },
  );
}

/** All four owners commit together; file I/O has already settled. */
export function acceptSession(
  db: BetterSQLite3Database,
  id: string,
  facts: Omit<
    Awaited<ReturnType<typeof identifyImageFile>>,
    'identificationTags'
  >,
) {
  return db.transaction(
    (tx) => {
      const session = getPreparedSession(tx, id);
      if (session.state === 'duplicate') return session;
      if (
        session.state !== 'finalizing' ||
        !session.finalKey ||
        !session.byteSize ||
        !session.sourceSha256
      )
        throw new UploadError(
          'UPLOAD_STATE_CONFLICT',
          '会话不能交接',
          409,
          session.imageId,
        );
      requireSessionStorage(tx, session);
      const duplicate = finishDuplicateSession(tx, id);
      if (duplicate) return duplicate;
      const submission = tx
        .select()
        .from(uploadSubmissions)
        .where(eq(uploadSubmissions.id, session.submissionId))
        .get()!;
      const result = acceptOriginal(tx, {
        imageId: session.candidateImageId,
        ...(session.route === 'direct' || session.route === 'relay'
          ? { jobId: session.candidateJobId! }
          : {}),
        storageId: session.storageId,
        originalName: session.originalName,
        visibility: submission.visibility,
        key: session.finalKey,
        byteSize: session.byteSize,
        contentSha256: session.sourceSha256,
        ...facts,
        snapshot: submission.snapshot,
        expectedVersions: submission.snapshot.compressionEnabled
          ? ['compressed', 'thumbnail']
          : ['thumbnail'],
      });
      attachAcceptedImage(tx, result.imageId, {
        albumIds: submission.albumIds,
        tagIds: submission.tagIds,
      });
      const pendingCleanup =
        session.route === 'direct' || submission.source === 'api';
      tx.update(uploadSessions)
        .set({
          state: 'accepted',
          imageId: result.imageId,
          jobId: result.jobId,
          temporaryKey:
            session.route === 'direct' ? session.temporaryKey : null,
          temporaryPath:
            submission.source === 'api' ? session.temporaryPath : null,
          finalKey: null,
          finalBytes: null,
          cleanupStatus: pendingCleanup ? 'pending' : 'none',
          nextCleanupAt: pendingCleanup ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(uploadSessions.id, id))
        .run();
      tx.update(uploadSubmissions)
        .set({ lastActivityAt: new Date() })
        .where(eq(uploadSubmissions.id, session.submissionId))
        .run();
      return getPreparedSession(tx, id);
    },
    { behavior: 'immediate' },
  );
}
