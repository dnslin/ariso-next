import { fileURLToPath } from 'node:url';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';

export const epoch = Date.UTC(2026, 0, 1);

/** Deterministic synthetic density, not a claim about measured user data. */
export function productionImage(i: number) {
  const bucket = (Math.imul(i, 2654435761) >>> 0) % 100;
  return {
    id: `image-${String(i).padStart(6, '0')}`,
    storageId: `storage-${i % 4}`,
    displayName: i % 101 === 0 ? `旅行 100%_真实 ${i}` : `Photo ${i}`,
    originalName: i % 103 === 0 ? `Archive_${i}.JPG` : `original-${i}.jpg`,
    visibility: i % 3 === 0 ? 'private' : 'public',
    format: ['JPEG', 'PNG', 'WEBP', 'AVIF'][i % 4],
    byteSize: 1024 * (1 + (i % 2000)),
    status:
      bucket < 70
        ? 'ready'
        : bucket < 80
          ? 'pending'
          : bucket < 90
            ? 'processing'
            : 'failed',
    createdAt: epoch + Math.floor(i / 8) * 1000,
    trashedAt: i % 20 === 0 ? epoch + Math.floor(i / 16) * 1000 : null,
    tagIds: Array.from(
      { length: i % 6 },
      (_, n) => `tag-${n === 0 ? i % 8 : 8 + ((i * 7 + n * 13) % 120)}`,
    ),
    albumIds: Array.from(
      { length: i % 4 },
      (_, n) => `album-${n === 0 && i % 5 === 0 ? 0 : (i + n * 7) % 40}`,
    ),
  };
}

/** Actual migrations and production relations, versions and immutable job snapshots. */
export function createProductionFixture(path: string, count: number) {
  const connection = openRuntimeDatabase(path);
  try {
    migrateRuntimeDatabase(
      connection.db,
      fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    );
    connection.db.transaction((tx) => prepareInitialMedia(tx));
    const snapshot = JSON.stringify(
      connection.db.transaction((tx) => createProcessingSnapshot(tx)),
    );
    const db = connection.db.$client;
    const storage = db.prepare(
      "INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES (?, ?, 'local', ?, ?, ?, ?)",
    );
    const image = db.prepare(`INSERT INTO media_images
      (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,processing_status,created_at,updated_at,trashed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1200, 800, ?, ?, ?, ?, ?)`);
    const album = db.prepare(
      "INSERT INTO albums (id,name,description,created_at,updated_at) VALUES (?, ?, '', ?, ?)",
    );
    const tag = db.prepare(
      'INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    const membership = db.prepare(
      'INSERT INTO album_images (album_id,image_id,joined_at) VALUES (?, ?, ?)',
    );
    const tagged = db.prepare(
      'INSERT INTO image_tags (image_id,tag_id) VALUES (?, ?)',
    );
    const object = db.prepare(`INSERT INTO media_objects
      (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at)
      VALUES (?, ?, ?, ?, ?, 'stored', ?, ?, ?, ?, ?)`);
    const version = db.prepare(`INSERT INTO media_versions
      (image_id,kind,object_id,width,height,byte_size,format,mime,created_at)
      VALUES (?, ?, ?, 1200, 800, ?, ?, ?, ?)`);
    const job = db.prepare(`INSERT INTO media_jobs
      (id,image_id,kind,scope,snapshot,expected_versions,status,error,step,created_at,updated_at)
      VALUES (?, ?, 'process', 'all', ?, '["thumbnail"]', ?, ?, 'thumbnail', ?, ?)`);
    db.transaction(() => {
      for (let i = 0; i < 4; i++)
        storage.run(
          `storage-${i}`,
          `Storage ${i}`,
          i === 3 ? 0 : 1,
          `/fixture/storage-${i}`,
          epoch,
          epoch,
        );
      for (let i = 0; i < 40; i++)
        album.run(`album-${i}`, `Album ${i}`, epoch, epoch);
      for (let i = 0; i < 128; i++)
        tag.run(`tag-${i}`, `Tag ${i}`, `tag ${i}`, epoch, epoch);
      for (let i = 0; i < count; i++) {
        const row = productionImage(i);
        image.run(
          row.id,
          row.storageId,
          row.originalName,
          row.displayName,
          row.visibility,
          row.format,
          `image/${row.format.toLowerCase()}`,
          row.byteSize,
          row.status,
          row.createdAt,
          row.createdAt,
          row.trashedAt,
        );
        for (const id of row.albumIds)
          membership.run(id, row.id, epoch + Math.floor(i / 11) * 1000);
        for (const id of row.tagIds) tagged.run(row.id, id);
        for (const kind of row.status === 'ready'
          ? ['original', 'thumbnail']
          : ['original']) {
          const objectId = `${row.id}-${kind}`;
          const bytes = kind === 'original' ? row.byteSize : 512;
          const format = kind === 'original' ? row.format : 'WEBP';
          const mime = `image/${format.toLowerCase()}`;
          object.run(
            objectId,
            row.id,
            row.storageId,
            `fixture/${objectId}`,
            kind,
            bytes,
            format,
            mime,
            row.createdAt,
            row.createdAt,
          );
          version.run(
            row.id,
            kind,
            objectId,
            bytes,
            format,
            mime,
            row.createdAt,
          );
        }
        const status =
          row.status === 'ready'
            ? 'succeeded'
            : row.status === 'pending'
              ? 'queued'
              : row.status === 'processing'
                ? 'running'
                : 'failed';
        job.run(
          `${row.id}-initial`,
          row.id,
          snapshot,
          status,
          status === 'failed' ? 'Fixture failure' : null,
          row.createdAt,
          row.createdAt,
        );
        if (row.status === 'ready' && i % 7 === 0)
          job.run(
            `${row.id}-reprocess`,
            row.id,
            snapshot,
            'failed',
            'Fixture reprocessing failure',
            row.createdAt + 1,
            row.createdAt + 1,
          );
      }
    })();
    db.exec('ANALYZE');
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}
