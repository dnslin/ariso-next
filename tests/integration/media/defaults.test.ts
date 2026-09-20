import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { mediaSettings } from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
  readMediaSettings,
  requireMediaSettings,
  updateMediaSettings,
} from '../../../src/server/media/settings.ts';
import { initialMediaSettings } from '../../../src/server/media/validation.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-media-defaults-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const initialize = () => connection.db.transaction(prepareInitialMedia);
const snapshot = () => connection.db.transaction(createProcessingSnapshot);
const update = (input: unknown) =>
  connection.db.transaction((tx) => updateMediaSettings(tx, input));

describe('T-MED-02 real SQLite defaults', () => {
  it('migration leaves settings uninitialized and reads never invent defaults', () => {
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    expect(readMediaSettings(connection.db)).toBeNull();
    for (const read of [
      () => requireMediaSettings(connection.db),
      snapshot,
      () => update(initialMediaSettings),
    ]) {
      expect(read).toThrowError(
        expect.objectContaining({ code: 'MEDIA_NOT_INITIALIZED' }),
      );
    }
    expect(readMediaSettings(connection.db)).toBeNull();
  });
  it('prepares exactly the required defaults, once, with a stable timestamp', () => {
    const saved = initialize();
    expect(saved).toEqual({
      id: 1,
      ...initialMediaSettings,
      updatedAt: expect.any(Date),
    });
    expect(initialize()).toEqual(saved);
    expect(connection.db.select().from(mediaSettings).all()).toEqual([saved]);
    expect(() =>
      connection.db
        .insert(mediaSettings)
        .values({ ...saved, id: 2 })
        .run(),
    ).toThrow();
  });
  it('rolls back initialization with other setup writes and permits retry', () => {
    connection.db.$client.exec(
      'CREATE TABLE setup_owner (id INTEGER PRIMARY KEY CHECK (id = 1))',
    );
    expect(() =>
      connection.db.transaction((tx) => {
        prepareInitialMedia(tx);
        tx.run('INSERT INTO setup_owner VALUES (2)');
      }),
    ).toThrow();
    expect(readMediaSettings(connection.db)).toBeNull();
    expect(
      connection.db.$client.prepare('SELECT * FROM setup_owner').all(),
    ).toEqual([]);
    connection.db.transaction((tx) => {
      prepareInitialMedia(tx);
      tx.run('INSERT INTO setup_owner VALUES (1)');
    });
    expect(requireMediaSettings(connection.db)).toMatchObject(
      initialMediaSettings,
    );
    expect(
      connection.db.$client.prepare('SELECT * FROM setup_owner').all(),
    ).toEqual([{ id: 1 }]);
  });
  it('rejects disabling the default without changing it, preserving all existing fields', () => {
    const saved = initialize();
    expect(() =>
      update({
        ...initialMediaSettings,
        compressionEnabled: false,
        quality: 50,
      }),
    ).toThrowError(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ['defaultLinkVersion'] }),
        ]),
      }),
    );
    expect(requireMediaSettings(connection.db)).toEqual(saved);
    const changed = update({
      ...initialMediaSettings,
      compressionEnabled: false,
      defaultLinkVersion: 'original',
      quality: 50,
    });
    expect(changed).toMatchObject({
      compressionEnabled: false,
      defaultLinkVersion: 'original',
      quality: 50,
    });
    const watermark = update({
      ...initialMediaSettings,
      watermarkMode: 'text',
      defaultLinkVersion: 'watermark',
    });
    expect(() => update({ ...watermark, watermarkMode: 'off' })).toThrow();
    expect(requireMediaSettings(connection.db)).toEqual(watermark);
    expect(
      update({
        ...watermark,
        watermarkMode: 'off',
        defaultLinkVersion: 'compressed',
      }),
    ).toMatchObject({ watermarkMode: 'off', defaultLinkVersion: 'compressed' });
  });
  it('rolls back a valid update when the transaction owner fails', () => {
    const saved = initialize();
    const failure = new Error('setup composition failed');
    expect(() =>
      connection.db.transaction((tx) => {
        updateMediaSettings(tx, { ...initialMediaSettings, quality: 30 });
        throw failure;
      }),
    ).toThrow(failure);
    expect(requireMediaSettings(connection.db)).toEqual(saved);
  });
  it('new snapshots follow settings, while existing snapshots remain detached and exclude live controls', () => {
    initialize();
    const old = snapshot();
    expect(old).toEqual({
      compressionEnabled: true,
      outputFormat: 'webp',
      quality: 82,
      maxEdge: null,
      jpegBackground: '#FFFFFF',
      watermarkMode: 'off',
      defaultVisibility: 'public',
    });
    update({
      ...initialMediaSettings,
      quality: 60,
      outputFormat: 'jpeg',
      maxEdge: 2000,
      jpegBackground: '#123456',
      defaultVisibility: 'private',
      defaultLinkVersion: 'original',
      concurrency: 4,
    });
    const next = snapshot();
    expect(next).toEqual({
      ...old,
      quality: 60,
      outputFormat: 'jpeg',
      maxEdge: 2000,
      jpegBackground: '#123456',
      defaultVisibility: 'private',
    });
    expect(old.quality).toBe(82);
    next.quality = 10;
    expect(snapshot().quality).toBe(60);
    expect(snapshot()).not.toHaveProperty('defaultLinkVersion');
    expect(snapshot()).not.toHaveProperty('concurrency');
    expect(requireMediaSettings(connection.db).defaultLinkVersion).toBe(
      'original',
    );
  });
  it('another process reruns migration and initialization without overwriting user settings', () => {
    initialize();
    const saved = update({
      ...initialMediaSettings,
      compressionEnabled: false,
      outputFormat: 'avif',
      quality: 95,
      maxEdge: 1000,
      jpegBackground: '#abcdef',
      defaultLinkVersion: 'original',
      defaultVisibility: 'private',
      concurrency: 3,
    });
    connection.close();
    const child = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { openRuntimeDatabase } from './src/server/runtime/db.ts';
      import { migrateRuntimeDatabase } from './src/server/runtime/migrations.ts';
      import { prepareInitialMedia } from './src/server/media/settings.ts';
      const connection = openRuntimeDatabase(process.argv[1]);
      try {
        migrateRuntimeDatabase(connection.db, 'drizzle');
        console.log(JSON.stringify(connection.db.transaction(prepareInitialMedia)));
      } finally { connection.close(); }
    `,
        join(directory, 'ariso.db'),
      ],
      { cwd: resolve('.'), encoding: 'utf8', timeout: 10000 },
    );
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    expect(JSON.parse(child)).toEqual({
      ...saved,
      updatedAt: saved.updatedAt.toISOString(),
    });
    expect(requireMediaSettings(connection.db)).toEqual(saved);
  });
});
