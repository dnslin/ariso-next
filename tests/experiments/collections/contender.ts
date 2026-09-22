import assert from 'node:assert/strict';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { createTag, renameTag, type Operation } from './database.ts';

const connection = openRuntimeDatabase(process.argv[2]);
const db = connection.db.$client;
const operation: Operation = JSON.parse(process.argv[3]);
process.once('message', () => {
  try {
    // Prove a real competing writer holds the lock before attempting the operation.
    db.pragma('busy_timeout = 0');
    assert.throws(() => db.exec('BEGIN IMMEDIATE'), { code: 'SQLITE_BUSY' });
    db.pragma('busy_timeout = 5000');
    process.send!({ type: 'contended' });
    let outcome;
    try {
      const row = operation.id
        ? renameTag(db, operation.id, operation.name)
        : createTag(db, operation.name);
      outcome = { status: 'success', row };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'SQLITE_CONSTRAINT_UNIQUE'
      )
        throw error;
      outcome = { status: 'conflict', code: error.code };
    }
    process.send!({
      type: 'result',
      outcome: {
        input: operation,
        pid: process.pid,
        lockProbe: 'SQLITE_BUSY',
        ...outcome,
      },
    });
  } finally {
    connection.close();
    process.disconnect!();
  }
});
process.send!({ type: 'ready' });
