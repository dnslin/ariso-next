import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { activate, paths } from './model.mjs';

const [action, root, stopAt] = process.argv.slice(2);

if (action === 'old-wal') {
  mkdirSync(root, { recursive: true });
  const db = new Database(paths(root).database);
  db.pragma('journal_mode = WAL');
  db.pragma('wal_autocheckpoint = 0');
  db.exec(`
    CREATE TABLE owner (id TEXT PRIMARY KEY, password TEXT NOT NULL);
    CREATE TABLE old_marker (value TEXT NOT NULL);
    INSERT INTO old_marker VALUES ('old-base');
  `);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.prepare('INSERT INTO old_marker VALUES (?)').run('old-wal-only');
  process.send?.({ ready: true });
  setInterval(() => {}, 1000);
} else if (action === 'activate') {
  try {
    await activate(root, stopAt);
    process.send?.({ completed: true });
    process.disconnect?.();
  } catch (error) {
    process.stderr.write(String(error?.stack ?? error) + '\n');
    process.exitCode = 1;
    process.disconnect?.();
  }
} else {
  throw new Error('Unknown experiment worker action');
}
