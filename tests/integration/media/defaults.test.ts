import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  mediaSettings,
  mediaWatermarkAssets,
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
  readMediaSettings,
  requireMediaSettings,
  updateMediaSettings,
  patchMediaSettings,
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
      watermarkText: '水印',
      defaultLinkVersion: 'watermark',
    });
    const watermarkInput = {
      ...initialMediaSettings,
      watermarkMode: 'text',
      watermarkText: '水印',
      defaultLinkVersion: 'watermark',
    };
    expect(() => update({ ...watermarkInput, watermarkMode: 'off' })).toThrow();
    expect(requireMediaSettings(connection.db)).toEqual(watermark);
    expect(
      update({
        ...watermarkInput,
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
      watermarkText: initialMediaSettings.watermarkText,
      watermarkFont: initialMediaSettings.watermarkFont,
      watermarkFontSize: initialMediaSettings.watermarkFontSize,
      watermarkColor: initialMediaSettings.watermarkColor,
      watermarkStrokeColor: initialMediaSettings.watermarkStrokeColor,
      watermarkStrokeWidth: initialMediaSettings.watermarkStrokeWidth,
      watermarkOpacity: initialMediaSettings.watermarkOpacity,
      watermarkPosition: initialMediaSettings.watermarkPosition,
      watermarkMargin: initialMediaSettings.watermarkMargin,
      watermarkWidth: initialMediaSettings.watermarkWidth,
      watermarkAsset: null,
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

it('merges partial saves atomically and retains inactive text and fractional rendering parameters', () => {
  initialize();
  const patch = (value: unknown) => patchMediaSettings(connection.db, value);
  const text = {
    watermarkMode: 'text',
    watermarkText: '%[filename] @/tmp/private\\n 你好',
    watermarkFont: 'latin',
    watermarkFontSize: 4.5,
    watermarkColor: '#112233',
    watermarkStrokeColor: '#334455',
    watermarkStrokeWidth: 1.5,
    watermarkOpacity: 70.5,
    watermarkPosition: 'top-center',
    watermarkMargin: 5.5,
    watermarkWidth: 30.5,
    defaultLinkVersion: 'watermark',
  };
  patch(text);
  const old = snapshot();
  const rendering: Partial<typeof text> = { ...text };
  delete rendering.defaultLinkVersion;
  expect(old).toMatchObject(rendering);
  const saved = requireMediaSettings(connection.db);
  expect(() => patch({ watermarkMode: 'off', quality: 10 })).toThrow();
  expect(requireMediaSettings(connection.db)).toEqual(saved);
  patch({ watermarkMode: 'off', defaultLinkVersion: 'original' });
  patch({ watermarkMode: 'text' });
  expect(snapshot()).toEqual(old);
  patch({ watermarkText: '新的文字', watermarkOpacity: 20 });
  expect(old.watermarkText).toBe(text.watermarkText);
  expect(old.watermarkOpacity).toBe(70.5);
  expect(snapshot().watermarkText).toBe('新的文字');
});
it('adopts only selectable assets atomically and freezes the exact selected asset in snapshots', () => {
  initialize();
  const now = new Date();
  const insert = (
    expiresAt: Date | null,
    status: 'ready' | 'cleanup_pending' = 'ready',
  ) => {
    const id = randomUUID();
    connection.db
      .insert(mediaWatermarkAssets)
      .values({
        id,
        path: `${id}/source`,
        format: 'PNG',
        mime: 'image/png',
        width: 20,
        height: 10,
        byteSize: 80,
        status,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  };
  const patch = (value: unknown) => patchMediaSettings(connection.db, value);
  const assetId = insert(new Date(now.getTime() + 3600000));
  expect(() =>
    patch({
      watermarkAssetId: assetId,
      watermarkMode: 'image',
      compressionEnabled: false,
    }),
  ).toThrow();
  expect(
    connection.db.select().from(mediaWatermarkAssets).get()!.expiresAt,
  ).not.toBeNull();
  patch({ watermarkAssetId: assetId, watermarkMode: 'image' });
  const old = snapshot();
  expect(old.watermarkAsset).toMatchObject({
    id: assetId,
    path: `${assetId}/source`,
    width: 20,
    height: 10,
  });
  expect(
    connection.db.select().from(mediaWatermarkAssets).get()!.expiresAt,
  ).toBeNull();
  const saved = requireMediaSettings(connection.db);
  for (const id of [
    randomUUID(),
    insert(new Date(now.getTime() - 1)),
    insert(null, 'cleanup_pending'),
  ]) {
    expect(() => patch({ watermarkAssetId: id })).toThrowError(
      expect.objectContaining({ code: 'MEDIA_WATERMARK_UNAVAILABLE' }),
    );
    expect(requireMediaSettings(connection.db)).toEqual(saved);
  }
  const nextId = insert(null);
  patch({ watermarkAssetId: nextId });
  expect(snapshot().watermarkAsset!.id).toBe(nextId);
  expect(old.watermarkAsset!.id).toBe(assetId);
  patch({ watermarkMode: 'off' });
  expect(snapshot().watermarkAsset).toBeNull();
  expect(requireMediaSettings(connection.db).watermarkAssetId).toBe(nextId);
});
