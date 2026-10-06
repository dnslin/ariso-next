import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { uploadSessions, uploadSubmissions } from './schema.ts';

export function readUploadObjectReferences(
  db: BetterSQLite3Database,
  storageId: string,
  key: string,
) {
  return db
    .select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(
      or(
        and(
          eq(uploadSessions.storageId, storageId),
          eq(uploadSessions.temporaryKey, key),
        ),
        and(
          eq(uploadSessions.storageId, storageId),
          eq(uploadSessions.finalKey, key),
        ),
      ),
    )
    .all();
}

/** Explicit empty-storage deletion releases short-lived results, never object cleanup responsibilities. */
export function releaseStorageHistory(
  db: BetterSQLite3Database,
  storageId: string,
) {
  db.transaction((tx) => {
    tx.delete(uploadSessions)
      .where(
        and(
          eq(uploadSessions.storageId, storageId),
          inArray(uploadSessions.state, [
            'accepted',
            'failed',
            'cancelled',
            'expired',
          ]),
          eq(uploadSessions.cleanupStatus, 'none'),
          isNull(uploadSessions.temporaryKey),
          isNull(uploadSessions.finalKey),
          isNull(uploadSessions.temporaryPath),
        ),
      )
      .run();
    const retained = tx
      .select({ id: uploadSessions.submissionId })
      .from(uploadSessions)
      .where(isNotNull(uploadSessions.submissionId));
    tx.delete(uploadSubmissions)
      .where(
        and(
          eq(uploadSubmissions.storageId, storageId),
          notInArray(uploadSubmissions.id, retained),
        ),
      )
      .run();
  });
}

/** Session and exact-object responsibilities consumed by storage composition. */
export function readUploadReferences(db: BetterSQLite3Database) {
  return db
    .select({
      storageId: uploadSessions.storageId,
      sessionId: uploadSessions.id,
      state: uploadSessions.state,
      temporaryKey: uploadSessions.temporaryKey,
      finalKey: uploadSessions.finalKey,
      temporaryPath: uploadSessions.temporaryPath,
      cleanupStatus: uploadSessions.cleanupStatus,
    })
    .from(uploadSessions)
    .where(
      and(
        isNotNull(uploadSessions.storageId),
        or(
          inArray(uploadSessions.state, [
            'queued',
            'receiving',
            'validating',
            'finalizing',
          ]),
          ne(uploadSessions.cleanupStatus, 'none'),
          isNotNull(uploadSessions.temporaryKey),
          isNotNull(uploadSessions.finalKey),
          isNotNull(uploadSessions.temporaryPath),
        ),
      ),
    )
    .all()
    .map((session) => ({ ...session, storageId: session.storageId! }));
}
/** tmp files and media-owned originals never count as configuration storage. */
export function readUploadUsage(db: BetterSQLite3Database) {
  const totals = new Map<
    string,
    {
      storageId: string;
      knownBytes: number;
      unconfirmedObjects: number;
      confirmedAt: Date | null;
    }
  >();
  for (const session of db.select().from(uploadSessions).all()) {
    if (!session.storageId) continue;
    for (const [key, bytes] of [
      [session.temporaryKey, session.temporaryBytes],
      [session.finalKey, session.finalBytes],
    ] as const) {
      if (!key) continue;
      const total = totals.get(session.storageId) ?? {
        storageId: session.storageId,
        knownBytes: 0,
        unconfirmedObjects: 0,
        confirmedAt: null,
      };
      if (bytes === null) total.unconfirmedObjects++;
      else total.knownBytes += bytes;
      if (
        session.confirmedAt &&
        (!total.confirmedAt || session.confirmedAt < total.confirmedAt)
      )
        total.confirmedAt = session.confirmedAt;
      totals.set(session.storageId, total);
    }
  }
  return [...totals.values()];
}
