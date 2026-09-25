import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';
import {
  prepareInitialMedia,
  createProcessingSnapshot,
} from '../../../src/server/media/settings.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';

export async function createCountFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-count-'));
  const storageRoot = join(directory, 'storage');
  await mkdir(storageRoot);
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  const db = connection.db;
  migrateRuntimeDatabase(db, resolve('drizzle'));
  prepareInitialStorage(db, { storage: storageRoot });
  db.transaction((tx) => prepareInitialMedia(tx));
  db.insert(siteSettings)
    .values({
      publicUrl: 'http://localhost',
      timeZone: 'Asia/Shanghai',
      updatedAt: new Date(),
    })
    .run();
  const storage = resolveUploadStorage(db);
  const imageId = randomUUID();
  const bytes = Buffer.alloc(1024 * 1024, 42);
  const plan = planLocalWrite('uploads');
  await writeObject(storageRoot, storage, plan, Readable.from(bytes));
  db.transaction((tx) => {
    acceptOriginal(tx, {
      imageId,
      storageId: storage.id,
      key: plan.key,
      originalName: 'sample.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: bytes.length,
      classification: 'static',
      animated: false,
      pageCount: 1,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: [],
    });
    tx.update(mediaImages).set({ processingStatus: 'ready' }).run();
  });
  const original = db.select().from(mediaObjects).get()!;
  // All four published versions share fixture bytes, but have real version/object rows.
  for (const kind of ['compressed', 'watermark', 'thumbnail'] as const) {
    const id = randomUUID();
    const derived = planLocalWrite('derived');
    await writeObject(storageRoot, storage, derived, Readable.from(bytes));
    db.insert(mediaObjects)
      .values({ ...original, id, key: derived.key, purpose: kind })
      .run();
    db.insert(mediaVersions)
      .values({
        imageId,
        kind,
        objectId: id,
        byteSize: bytes.length,
        format: 'PNG',
        mime: 'image/png',
        createdAt: new Date(),
      })
      .run();
  }
  return {
    directory,
    connection,
    db,
    imageId,
    storage,
    bytes,
    async close() {
      connection.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
