import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { mediaWatermarkAssets } from '../../../src/server/media/schema.ts';
import {
  prepareInitialMedia,
  updateMediaSettings,
} from '../../../src/server/media/settings.ts';
import { initialMediaSettings } from '../../../src/server/media/validation.ts';
import {
  getWatermarkAsset,
  readWatermarkAsset,
} from '../../../src/server/media/watermark-assets.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
const now = new Date('2026-10-05T00:00:00Z');

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-watermark-read-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction(prepareInitialMedia);
});

afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

function asset() {
  const id = randomUUID();
  return connection.db
    .insert(mediaWatermarkAssets)
    .values({
      id,
      path: `${id}/source`,
      format: 'PNG',
      mime: 'image/png',
      width: 320,
      height: 120,
      byteSize: 18640,
      status: 'ready',
      expiresAt: new Date(now.getTime() + 3_600_000),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()!;
}

it('reads temporary attributes without adopting the asset or changing its expiry', () => {
  const saved = asset();
  expect(readWatermarkAsset(connection.db, saved.id, now)).toEqual({
    ...saved,
    available: true,
  });
  expect(getWatermarkAsset(connection.db, saved.id)).toEqual(saved);
});

it('marks the exact expiration boundary unavailable while retaining the actual ready status', () => {
  const saved = asset();
  const expiresAt = saved.expiresAt!;
  expect(
    readWatermarkAsset(
      connection.db,
      saved.id,
      new Date(expiresAt.getTime() - 1),
    ).available,
  ).toBe(true);
  expect(readWatermarkAsset(connection.db, saved.id, expiresAt)).toEqual({
    ...saved,
    available: false,
  });
  expect(getWatermarkAsset(connection.db, saved.id)).toEqual(saved);
});

it('reports adoption from the saved expiry without imposing the former temporary deadline', () => {
  const saved = asset();
  connection.db.transaction((tx) =>
    updateMediaSettings(
      tx,
      {
        ...initialMediaSettings,
        watermarkMode: 'image',
        watermarkAssetId: saved.id,
      },
      now,
    ),
  );
  const adopted = getWatermarkAsset(connection.db, saved.id)!;
  expect(adopted.expiresAt).toBeNull();
  expect(
    readWatermarkAsset(
      connection.db,
      saved.id,
      new Date(now.getTime() + 7_200_000),
    ),
  ).toEqual({ ...adopted, available: true });
  expect(getWatermarkAsset(connection.db, saved.id)).toEqual(adopted);
});

it.each(['writing', 'cleanup_pending', 'cleanup_failed', 'deleted'] as const)(
  'keeps %s lifecycle facts and diagnostics visible without claiming availability',
  (status) => {
    const saved = asset();
    connection.db
      .update(mediaWatermarkAssets)
      .set({ status, error: 'injected lifecycle diagnostic' })
      .where(eq(mediaWatermarkAssets.id, saved.id))
      .run();
    const current = getWatermarkAsset(connection.db, saved.id)!;
    expect(readWatermarkAsset(connection.db, saved.id, now)).toEqual({
      ...current,
      available: false,
    });
    expect(getWatermarkAsset(connection.db, saved.id)).toEqual(current);
  },
);

it('distinguishes an absent asset from a persisted unavailable asset', () => {
  const id = randomUUID();
  expect(() => readWatermarkAsset(connection.db, id, now)).toThrowError(
    expect.objectContaining({
      code: 'MEDIA_WATERMARK_NOT_FOUND',
      status: 404,
    }),
  );
  expect(connection.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});
