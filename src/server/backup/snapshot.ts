import Database from 'better-sqlite3';
import { mkdir, open, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import { normalizeSnapshot } from './normalize.ts';

export async function snapshotDatabase(options: {
  db: ReturnType<typeof openRuntimeDatabase>['db'];
  destination: string;
}) {
  await mkdir(dirname(options.destination), { recursive: true, mode: 0o700 });
  const snapshotStartedAt = Date.now();
  try {
    await options.db.$client.backup(options.destination);
    const copy = new Database(options.destination, { fileMustExist: true });
    try {
      copy.pragma('foreign_keys = ON');
      copy.pragma('journal_mode = DELETE');
      normalizeSnapshot(copy);
      // Remove deleted login material from free pages in the portable database.
      copy.exec('VACUUM');
    } finally {
      copy.close();
    }
    const file = await open(options.destination, 'r');
    try {
      await file.sync();
    } finally {
      await file.close();
    }
    return { snapshotStartedAt, snapshotCompletedAt: Date.now() };
  } catch (error) {
    await rm(options.destination, { force: true });
    throw error;
  }
}
