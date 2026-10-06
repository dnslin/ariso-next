import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  seedViewerFixtures,
  viewerStorage,
} from '../../../../../e2e/library-viewer-fixtures.mjs';
import { readMediaObjectReferences } from '../../../../../src/server/media/references.ts';
import { createSecretCrypto } from '../../../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../../../src/server/runtime/migrations.ts';
import { scanStorage } from '../../../../../src/server/storage/scans.ts';

const phase = process.argv[2];
const directory = await mkdtemp(
  join(tmpdir(), 'ariso-viewer-fixture-lifecycle-'),
);
const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
migrateRuntimeDatabase(connection.db, resolve('drizzle'));
const output = join(directory, 'output');
await mkdir(output);
const scans = [];
const context = {
  db: connection.db,
  storageRoot: join(directory, 'storage'),
  secretCrypto: createSecretCrypto(Buffer.alloc(32, 1)),
  readReferences: (db, id, key) => ({
    counts: {},
    keys: new Set(readMediaObjectReferences(db, id, key).map((row) => row.key)),
    activeWrites: 0,
  }),
};
async function scan(stage) {
  const { status, discoveredCount, deletedCount, protectedCount, failedCount } =
    await scanStorage(context, viewerStorage);
  scans.push({
    stage,
    status,
    discoveredCount,
    deletedCount,
    protectedCount,
    failedCount,
  });
}
let firstObject = true;
let fixtures;
let error;
const sql = async (statement) => {
  if (
    (firstObject && statement.startsWith('INSERT INTO media_objects')) ||
    statement.includes("VALUES ('issue185-candidate'")
  ) {
    await scan(
      firstObject
        ? 'before-first-object-registration'
        : 'before-candidate-registration',
    );
    firstObject = false;
  }
  const result = statement.startsWith('SELECT')
    ? connection.db.$client.prepare(statement).all()
    : connection.db.$client.exec(statement);
  if (statement.startsWith('INSERT INTO storage_configs'))
    await scan('after-storage-registration');
  return result;
};
try {
  fixtures = await seedViewerFixtures(
    { dataDirectory: directory, projectDirectory: process.cwd(), output },
    sql,
  );
  await scan('after-fixture-complete');
  const rows = connection.db.$client
    .prepare('SELECT id,key FROM media_objects WHERE storage_id=?')
    .all(viewerStorage);
  for (const row of rows) {
    assert.equal(
      existsSync(
        join(directory, 'storage/default/ariso', viewerStorage, row.key),
      ),
      row.id !== 'issue185-unreadable-compressed',
      row.id,
    );
  }
  assert.equal(
    scans.every((item) => item.deletedCount === 0),
    true,
  );
} catch (cause) {
  error = { message: cause.message, code: cause.code };
} finally {
  await writeFile(
    resolve(
      'test-results/sharing-192/viewer-fixture-lifecycle',
      `${phase}.json`,
    ),
    JSON.stringify({ phase, scans, completed: !!fixtures, error }, null, 2),
  );
  await fixtures?.cleanup();
  connection.close();
  await rm(directory, { recursive: true, force: true });
}
if (phase === 'red') {
  assert.equal(fixtures, undefined);
  assert.match(error.message, /original\.png/);
  assert.equal(scans[0].deletedCount, 4);
  assert.equal(scans[1].deletedCount, 1);
} else {
  assert.equal(error, undefined);
  assert.ok(fixtures);
}
console.log(
  JSON.stringify({
    phase,
    scans,
    completed: !!fixtures,
    expectedResultVerified: true,
  }),
);
