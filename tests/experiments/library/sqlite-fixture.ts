import type Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';

export const epoch = Date.UTC(2026, 0, 1);
export const candidateIndexes = [
  'CREATE INDEX experiment_uploaded_desc ON media_images(trashed_at, created_at DESC, id ASC)',
  'CREATE INDEX experiment_uploaded_asc ON media_images(trashed_at, created_at ASC, id ASC)',
  'CREATE INDEX experiment_size_desc ON media_images(trashed_at, byte_size DESC, id ASC)',
  'CREATE INDEX experiment_size_asc ON media_images(trashed_at, byte_size ASC, id ASC)',
];

// Synthetic, deterministic relationship density; not a claim about user traffic.
export function fixtureImage(i: number) {
  const bucket = (Math.imul(i, 2654435761) >>> 0) % 100;
  return {
    id: `image-${String(i).padStart(6, '0')}`,
    storageId: `storage-${i % 4}`,
    displayName: i % 101 === 0 ? `旅行 100%_真实 ${i}` : `Photo ${i}`,
    originalName: i % 103 === 0 ? `Archive_${i}.JPG` : `original-${i}.jpg`,
    visibility: i % 3 === 0 ? 'private' : 'public',
    format: ['jpeg', 'png', 'webp', 'avif'][i % 4],
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

export function createSqliteFixture(path: string, count: number) {
  const connection = openRuntimeDatabase(path);
  try {
    migrateRuntimeDatabase(
      connection.db,
      fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    );
    const db = connection.db.$client;
    // Collections has no production schema yet. These candidate relation tables
    // follow SPEC-collections §3, with IDs and added_at, not business modules.
    db.exec(`
      CREATE TABLE experiment_albums (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE experiment_tags (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE experiment_image_albums (
        image_id TEXT NOT NULL REFERENCES media_images(id),
        album_id TEXT NOT NULL REFERENCES experiment_albums(id),
        added_at INTEGER NOT NULL,
        PRIMARY KEY (image_id, album_id)
      );
      CREATE INDEX experiment_album_order ON experiment_image_albums(album_id, added_at DESC, image_id ASC);
      CREATE TABLE experiment_image_tags (
        image_id TEXT NOT NULL REFERENCES media_images(id),
        tag_id TEXT NOT NULL REFERENCES experiment_tags(id),
        PRIMARY KEY (image_id, tag_id)
      );
      CREATE INDEX experiment_tag_images ON experiment_image_tags(tag_id, image_id);
    `);
    const storage = db.prepare(
      'INSERT INTO storage_configs VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const image = db.prepare(`INSERT INTO media_images
      (id, storage_id, original_name, display_name, visibility, format, mime,
       width, height, byte_size, processing_status, created_at, updated_at, trashed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const album = db.prepare(
      'INSERT INTO experiment_image_albums VALUES (?, ?, ?)',
    );
    const tag = db.prepare('INSERT INTO experiment_image_tags VALUES (?, ?)');
    db.transaction(() => {
      for (let i = 0; i < 4; i++)
        storage.run(
          `storage-${i}`,
          `Storage ${i}`,
          'local',
          i === 3 ? 0 : 1,
          `/fixture/storage-${i}`,
          epoch,
          epoch,
        );
      for (let i = 0; i < 40; i++)
        db.prepare('INSERT INTO experiment_albums VALUES (?)').run(
          `album-${i}`,
        );
      for (let i = 0; i < 128; i++)
        db.prepare('INSERT INTO experiment_tags VALUES (?)').run(`tag-${i}`);
      for (let i = 0; i < count; i++) {
        const row = fixtureImage(i);
        image.run(
          row.id,
          row.storageId,
          row.originalName,
          row.displayName,
          row.visibility,
          row.format,
          `image/${row.format}`,
          1200,
          800,
          row.byteSize,
          row.status,
          row.createdAt,
          row.createdAt,
          row.trashedAt,
        );
        for (const id of row.albumIds)
          album.run(row.id, id, epoch + Math.floor(i / 11) * 1000);
        for (const id of row.tagIds) tag.run(row.id, id);
      }
    })();
    db.exec('ANALYZE');
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function installCandidateIndexes(db: Database.Database) {
  for (const sql of candidateIndexes) db.exec(sql);
  db.exec('ANALYZE');
}
