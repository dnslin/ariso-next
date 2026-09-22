import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { arch, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import {
  createAlbum,
  createFixture,
  createTag,
  readTag,
  renameTag,
} from './database.ts';
import { compete } from './concurrency.ts';
import { verifyUnicode } from './unicode.ts';

export async function runCollectionsExperiment() {
  const unicode = verifyUnicode();
  const directory = mkdtempSync(join(tmpdir(), 'ariso-collections-'));
  const path = join(directory, 'experiment.db');
  const connection = openRuntimeDatabase(path);
  const db = connection.db.$client;
  const require = createRequire(import.meta.url);
  try {
    createFixture(db);
    const samples = unicode.samples.map((sample) => {
      const row = createTag(db, sample.input);
      assert.equal(row.normalized_key, sample.normalizedKey);
      const first = unicode.samples.find(
        (other) => other.normalizedKey === sample.normalizedKey,
      )!;
      assert.equal(row.display_name, first.displayName);
      return { ...sample, stored: row };
    });
    const count = db.prepare('SELECT count(*) AS count FROM tags').get() as {
      count: number;
    };
    assert.equal(
      count.count,
      new Set(unicode.samples.map((sample) => sample.normalizedKey)).size,
    );
    const albums = [createAlbum(db, ' 旅行 '), createAlbum(db, '旅行')];
    assert.notEqual(albums[0].id, albums[1].id);
    assert.equal(albums[0].name, albums[1].name);
    const thirdAlbum = createAlbum(db, '出游');
    db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(
      '旅行',
      thirdAlbum.id,
    );
    const renamedAlbum = db
      .prepare('SELECT * FROM albums WHERE id = ?')
      .get(thirdAlbum.id);
    assert.deepEqual(renamedAlbum, { id: thirdAlbum.id, name: '旅行' });
    assert.equal(
      (
        db.prepare('SELECT count(*) AS count FROM albums').get() as {
          count: number;
        }
      ).count,
      3,
    );

    const original = createTag(db, 'Original');
    db.prepare('INSERT INTO image_tags VALUES (?, ?)').run(
      'image-1',
      original.id,
    );
    assert.deepEqual(renameTag(db, original.id, 'ORIGINAL'), original);
    const renamed = renameTag(db, original.id, 'New name');
    assert.equal(renamed.id, original.id);
    assert.equal(renamed.display_name, 'New name');
    assert.throws(() => renameTag(db, original.id, 'GO'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });
    assert.deepEqual(readTag(db, original.id), renamed);
    const memberships = db.prepare('SELECT * FROM image_tags').all();
    assert.deepEqual(memberships, [
      { image_id: 'image-1', tag_id: original.id },
    ]);
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO tags VALUES (?, ?, ?)')
          .run('duplicate', 'GO', 'go'),
      { code: 'SQLITE_CONSTRAINT_UNIQUE' },
    );
    db.exec(`CREATE TRIGGER reject_insert BEFORE INSERT ON tags
      WHEN NEW.display_name = 'Reject' BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END`);
    assert.throws(() => createTag(db, 'Reject'), {
      code: 'SQLITE_CONSTRAINT_TRIGGER',
    });
    assert.equal(
      db.prepare("SELECT * FROM tags WHERE normalized_key = 'reject'").get(),
      undefined,
    );
    db.exec('DROP TRIGGER reject_insert');

    // Remove the sequential sample so the race must create a genuinely new Go row.
    db.prepare("DELETE FROM tags WHERE normalized_key = 'go'").run();
    const creation = await compete(
      db,
      path,
      ['Go', 'go', 'GO'].map((name) => ({ name })),
    );
    assert(creation.every((outcome) => outcome.status === 'success'));
    const created = creation.map((outcome) => {
      assert(outcome.status === 'success');
      return outcome.row;
    });
    assert(
      created.every(
        (row) =>
          row.id === created[0].id &&
          row.display_name === created[0].display_name,
      ),
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM tags WHERE normalized_key = 'go'").all(),
      [created[0]],
    );
    assert.deepEqual(createTag(db, 'gO'), created[0]);

    const left = createTag(db, 'Left');
    const right = createTag(db, 'Right');
    db.prepare('INSERT INTO image_tags VALUES (?, ?)').run(
      'left-image',
      left.id,
    );
    db.prepare('INSERT INTO image_tags VALUES (?, ?)').run(
      'right-image',
      right.id,
    );
    const beforeRace = db
      .prepare('SELECT * FROM image_tags ORDER BY image_id')
      .all();
    const renaming = await compete(db, path, [
      { id: left.id, name: 'Contested' },
      { id: right.id, name: 'CONTESTED' },
    ]);
    assert.equal(
      renaming.filter((outcome) => outcome.status === 'success').length,
      1,
    );
    const loser = renaming.find((outcome) => outcome.status === 'conflict')!;
    assert(loser && loser.input.id);
    assert.deepEqual(
      readTag(db, loser.input.id),
      loser.input.id === left.id ? left : right,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM tags WHERE normalized_key = 'contested'",
        )
        .pluck()
        .get(),
      1,
    );
    assert.deepEqual(
      db.prepare('SELECT * FROM image_tags ORDER BY image_id').all(),
      beforeRace,
    );

    const mixedOriginal = createTag(db, 'Mixed original');
    const mixed = await compete(db, path, [
      { id: mixedOriginal.id, name: 'Mixed target' },
      { name: 'MIXED TARGET' },
    ]);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) FROM tags WHERE normalized_key = 'mixed target'",
        )
        .pluck()
        .get(),
      1,
    );
    const creationResult = mixed.find((outcome) => !outcome.input.id)!;
    assert(creationResult.status === 'success');
    const renameResult = mixed.find((outcome) => outcome.input.id)!;
    if (renameResult.status === 'conflict')
      assert.deepEqual(readTag(db, mixedOriginal.id), mixedOriginal);
    else assert.deepEqual(renameResult.row, creationResult.row);

    return {
      environment: {
        platform: platform(),
        release: release(),
        arch: arch(),
        node: process.version,
        icu: process.versions.icu,
        normalizationUnicode: process.versions.unicode,
        configuredPackageManager: require('../../../package.json')
          .packageManager,
        caseFolding: require('unicode-case-folding/package.json').version,
        betterSqlite3: require('better-sqlite3/package.json').version,
        sqlite: db.prepare('SELECT sqlite_version()').pluck().get(),
        journalMode: db.pragma('journal_mode', { simple: true }),
        busyTimeout: db.pragma('busy_timeout', { simple: true }),
      },
      unicode: { ...unicode, samples },
      albums,
      albumRename: { before: thirdAlbum, after: renamedAlbum },
      rename: {
        original,
        renamed,
        sameKey: 'unchanged',
        conflict: 'SQLITE_CONSTRAINT_UNIQUE',
        memberships,
      },
      concurrency: { creation, renaming, mixed },
      unexpectedError: 'SQLITE_CONSTRAINT_TRIGGER',
      passed: true,
    };
  } finally {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
