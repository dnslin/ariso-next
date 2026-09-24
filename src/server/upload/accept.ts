import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { attachAcceptedImage } from '../collections/memberships.ts';
import { acceptOriginal } from '../media/images.ts';
import type { inspectImage } from '../media/formats.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';
import { getSession, requireSessionStorage } from './sessions.ts';
import { UploadError } from './errors.ts';

/** All four owners commit together; file I/O has already settled. */
export function acceptSession(
  db: BetterSQLite3Database,
  id: string,
  facts: Awaited<ReturnType<typeof inspectImage>>,
) {
  return db.transaction(
    (tx) => {
      const session = getSession(tx, id);
      if (
        session.state !== 'finalizing' ||
        !session.finalKey ||
        !session.byteSize
      )
        throw new UploadError(
          'UPLOAD_STATE_CONFLICT',
          '会话不能交接',
          409,
          session.imageId,
        );
      requireSessionStorage(tx, session);
      const submission = tx
        .select()
        .from(uploadSubmissions)
        .where(eq(uploadSubmissions.id, session.submissionId))
        .get()!;
      const result = acceptOriginal(tx, {
        imageId: session.candidateImageId,
        storageId: session.storageId,
        originalName: session.originalName,
        visibility: submission.visibility,
        key: session.finalKey,
        byteSize: session.byteSize,
        ...facts,
        classification: 'static',
        snapshot: submission.snapshot,
        expectedVersions: submission.snapshot.compressionEnabled
          ? ['compressed', 'thumbnail']
          : ['thumbnail'],
      });
      attachAcceptedImage(tx, result.imageId, {
        albumIds: submission.albumIds,
        tagIds: submission.tagIds,
      });
      tx.update(uploadSessions)
        .set({
          state: 'accepted',
          imageId: result.imageId,
          jobId: result.jobId,
          temporaryKey: null,
          finalKey: null,
          cleanupStatus: 'none',
          updatedAt: new Date(),
        })
        .where(eq(uploadSessions.id, id))
        .run();
      return getSession(tx, id);
    },
    { behavior: 'immediate' },
  );
}
