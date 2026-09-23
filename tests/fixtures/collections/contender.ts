import assert from 'node:assert/strict';
import { count, eq } from 'drizzle-orm';
import { prepareUploadSelection } from '../../../src/server/collections/memberships.ts';
import { tags } from '../../../src/server/collections/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';

export type Outcome = {
  input: string;
  pid: number;
  lockProbe: 'SQLITE_BUSY';
  firstWriter: boolean;
  tag: { id: string; displayName: string; normalizedKey: string };
};

const connection = openRuntimeDatabase(process.argv[2]);
const db = connection.db;
const name = process.argv[3];

process.once('message', () => {
  try {
    // Every contender must encounter the parent's real write lock before racing.
    db.$client.pragma('busy_timeout = 0');
    assert.throws(() => db.$client.exec('BEGIN IMMEDIATE'), {
      code: 'SQLITE_BUSY',
    });
    db.$client.pragma('busy_timeout = 5000');
    process.send!({ type: 'contended' });
    const result = db.transaction(
      (tx) => {
        const firstWriter =
          tx.select({ count: count() }).from(tags).get()!.count === 0;
        const selection = prepareUploadSelection(tx, { tagNames: [name] });
        assert.equal(selection.tagIds.length, 1);
        const tag = tx
          .select({
            id: tags.id,
            displayName: tags.displayName,
            normalizedKey: tags.normalizedKey,
          })
          .from(tags)
          .where(eq(tags.id, selection.tagIds[0]))
          .get();
        assert.ok(tag);
        return { firstWriter, tag };
      },
      { behavior: 'immediate' },
    );
    const outcome: Outcome = {
      input: name,
      pid: process.pid,
      lockProbe: 'SQLITE_BUSY',
      ...result,
    };
    process.send!({ type: 'result', outcome });
  } finally {
    connection.close();
    process.disconnect!();
  }
});
process.send!({ type: 'ready' });
