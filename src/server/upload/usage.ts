import { inArray, isNotNull, ne, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { uploadSessions } from './schema.ts';

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
    )
    .all();
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
