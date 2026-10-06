import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { acceptOriginal } from '../../../../../dist/server/media/images.js';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaSettings,
} from '../../../../../dist/server/media/schema.js';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../../../dist/server/media/settings.js';
import { openRuntimeDatabase } from '../../../../../dist/server/runtime/db.js';
import { migrateRuntimeDatabase } from '../../../../../dist/server/runtime/migrations.js';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../../../dist/server/storage/defaults.js';
import {
  planLocalWrite,
  writeObject,
} from '../../../../../dist/server/storage/local.js';

const directory = await mkdtemp(join(tmpdir(), 'ariso-trash-fixture-lock-'));
const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
let writer;
const report = { stages: [], status: 'failed' };
try {
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  await mkdir(join(directory, 'storage'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  writer = openRuntimeDatabase(join(directory, 'ariso.db'));
  const storage = resolveLocalUploadStorage(connection.db);
  const plan = planLocalWrite('uploads');
  const bytes = await readFile('tests/fixtures/runtime/images/sample.png');
  await writeObject(
    join(directory, 'storage'),
    storage,
    plan,
    Readable.from(bytes),
  );
  connection.db.transaction((tx) => {
    const snapshot = createProcessingSnapshot(tx);
    report.stages.push('fixture-read-processing-snapshot');
    // A real committed write on another connection invalidates this WAL read snapshot.
    writer.db.update(mediaSettings).set({ updatedAt: new Date() }).run();
    report.stages.push('other-connection-write-committed');
    const accepted = acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: 'HTTP-original.png',
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: bytes.length,
      snapshot,
      expectedVersions: ['compressed', 'thumbnail'],
    });
    tx.update(mediaJobs)
      .set({ status: 'failed', error: 'fixture: prior processing failed' })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    tx.update(mediaImages)
      .set({ processingStatus: 'failed' })
      .where(eq(mediaImages.id, accepted.imageId))
      .run();
  });
  report.status = 'unexpected-success';
  throw new Error(
    'The original deferred fixture unexpectedly accepted a stale WAL snapshot',
  );
} catch (error) {
  report.error = { name: error.name, code: error.code, message: error.message };
  report.fixtureImages = connection.db.select().from(mediaImages).all().length;
  report.fixtureObjects = connection.db
    .select()
    .from(mediaObjects)
    .all().length;
  await writeFile(
    'test-results/sharing-192/regression-trash-fixture-lock-red.json',
    JSON.stringify(report, null, 2),
  );
  console.error(JSON.stringify(report));
  throw error;
} finally {
  writer?.close();
  connection.close();
  await rm(directory, { recursive: true, force: true });
}
