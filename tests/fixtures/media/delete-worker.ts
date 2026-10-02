import { join } from 'node:path';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { cleanupPermanentDeletes } from '../../../src/server/media/cleanup.ts';

const directory = process.argv[2];
const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
const checkpoint = process.argv[3];
connection.db.$client.function('deletion_checkpoint', () => {
  queueMicrotask(() => {
    process.send!({ checkpoint });
    process.kill(process.pid, 'SIGSTOP');
  });
  return 0;
});
connection.db.$client.exec(`
  CREATE TEMP TRIGGER checkpoint AFTER UPDATE ON main.media_objects
  WHEN ${checkpoint === 'intent' ? 'NEW.cleanup_attempts > OLD.cleanup_attempts' : "NEW.status = 'deleted' AND OLD.status != 'deleted'"}
  BEGIN SELECT deletion_checkpoint(); END;
`);
await cleanupPermanentDeletes(
  {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger: { info: () => {}, error: (error: unknown) => console.error(error) },
  },
  new Set(),
);
connection.close();
