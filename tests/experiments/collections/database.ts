import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { normalizeName, tagName } from './unicode.ts';

export type Tag = { id: string; display_name: string; normalized_key: string };
export type Operation = { name: string; id?: string };

export function createFixture(db: Database.Database) {
  db.exec(`
    CREATE TABLE albums (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE tags (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
      normalized_key TEXT NOT NULL UNIQUE
    );
    CREATE TABLE image_tags (
      image_id TEXT NOT NULL, tag_id TEXT NOT NULL REFERENCES tags(id),
      PRIMARY KEY (image_id, tag_id)
    );
  `);
}

export function readTag(db: Database.Database, id: string) {
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as
    Tag | undefined;
  assert(row, `Missing tag ${id}`);
  return row;
}

export function createTag(db: Database.Database, input: string) {
  const { displayName, normalizedKey } = tagName(input);
  return db
    .transaction(() => {
      // Only a normalized-key collision is a successful match; other failures surface.
      db.prepare(
        `INSERT INTO tags VALUES (?, ?, ?)
      ON CONFLICT(normalized_key) DO NOTHING`,
      ).run(randomUUID(), displayName, normalizedKey);
      const row = db
        .prepare('SELECT * FROM tags WHERE normalized_key = ?')
        .get(normalizedKey) as Tag | undefined;
      assert(row);
      return row;
    })
    .immediate();
}

export function renameTag(db: Database.Database, id: string, input: string) {
  const { displayName, normalizedKey } = tagName(input);
  return db
    .transaction(() => {
      const original = readTag(db, id);
      if (original.normalized_key === normalizedKey) return original;
      db.prepare(
        'UPDATE tags SET display_name = ?, normalized_key = ? WHERE id = ?',
      ).run(displayName, normalizedKey, id);
      return readTag(db, id);
    })
    .immediate();
}

export function createAlbum(db: Database.Database, input: string) {
  const row = { id: randomUUID(), name: normalizeName(input, 100) };
  db.prepare('INSERT INTO albums VALUES (@id, @name)').run(row);
  return row;
}
