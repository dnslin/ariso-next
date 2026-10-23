import Database from 'better-sqlite3';
import { join } from 'node:path';
import { activateRestore } from '../../../src/server/backup/activate.ts';
import { runPreflight } from '../../../src/server/startup/preflight.ts';
const [root, checkpoint, mode] = process.argv.slice(2);
if (mode === 'wal') {
  const db = new Database(join(root, 'ariso.db'));
  db.pragma('journal_mode=WAL');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.prepare("UPDATE storage_configs SET name='old blank default'").run();
  process.kill(process.pid, 'SIGKILL');
} else {
  activateRestore({
    dataDir: root,
    jobDirectory: join(root, 'restore', 'job'),
    application: { version: 'v1.2.1-local.1', revision: 'a'.repeat(40) },
    encryptionKey: Buffer.alloc(32, 17),
    checkpoint(name) {
      if (name === checkpoint) process.kill(process.pid, 'SIGKILL');
    },
  });
  runPreflight({
    DATA_DIR: root,
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    ARISO_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('hex'),
  });
}
