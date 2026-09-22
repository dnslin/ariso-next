import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import {
  acceptOriginal,
  type AcceptOriginalInput,
} from '../../../src/server/media/images.ts';

export function collectionFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-collections-'));
  const storageRoot = join(directory, 'storage');
  mkdirSync(storageRoot);
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  const db = connection.db;
  migrateRuntimeDatabase(db, resolve('drizzle'));
  prepareInitialStorage(db, { storage: storageRoot });
  const storage = resolveUploadStorage(db);
  const snapshot = db.transaction((tx) => {
    prepareInitialMedia(tx);
    return createProcessingSnapshot(tx);
  });
  function input(imageId: string = randomUUID()): AcceptOriginalInput {
    return {
      imageId,
      storageId: storage.id,
      originalName: 'sample.png',
      key: `uploads/${imageId}.png`,
      format: 'PNG',
      mime: 'image/png',
      byteSize: 100,
      visibility: 'public',
      snapshot,
      expectedVersions: ['thumbnail', 'compressed'],
    };
  }
  return {
    db,
    storage,
    input,
    storageRoot,
    image: (id: string = randomUUID()) =>
      db.transaction((tx) => acceptOriginal(tx, input(id))).imageId,
    close() {
      connection.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
