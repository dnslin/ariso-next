import { join } from 'node:path';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import { startMediaQueue } from '../../../src/server/media/queue.ts';

const directory = process.argv[2];
const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
// Pause only after SQLite has committed the published version. A microtask runs
// at the next asynchronous boundary, outside the synchronous transaction.
connection.db.$client.function('publication_checkpoint', () => {
  queueMicrotask(() => {
    process.send!({ checkpoint: 'compressed-published' });
    process.kill(process.pid, 'SIGSTOP');
  });
  return 0;
});
connection.db.$client.exec(`
  CREATE TEMP TRIGGER checkpoint AFTER INSERT ON main.media_versions
  WHEN NEW.kind = 'compressed'
  BEGIN SELECT publication_checkpoint(); END;
`);
const queue = startMediaQueue({
  db: connection.db,
  storageRoot: join(directory, 'storage'),
  temporaryRoot: join(directory, 'tmp'),
  logger: createRuntimeLogger('media.recovery-fixture', 'error'),
});
let stopping = false;
process.on('SIGTERM', () => {
  if (stopping) return;
  stopping = true;
  queue.stop().then(
    () => {
      connection.close();
      process.exit(143);
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
});
