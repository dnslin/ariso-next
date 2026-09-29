import { createMediaResources } from '../../../src/server/media/resources.ts';
import { crc32 } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import {
  mediaJobs,
  mediaWatermarkAssets,
} from '../../../src/server/media/schema.ts';
import {
  retainPreviewWatermark,
  releasePreviewWatermark,
  recoverWatermarkAssets,
} from '../../../src/server/media/watermark-assets.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { settleMediaFailure } from '../../../src/server/media/recovery.ts';
import {
  createSubmission,
  cancelSession,
} from '../../../src/server/upload/sessions.ts';
import { acceptSession } from '../../../src/server/upload/accept.ts';
import { uploadSessions } from '../../../src/server/upload/schema.ts';
import { hasUploadWatermarkReference } from '../../../src/server/upload/watermark-references.ts';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, afterEach, it, expect } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialMedia,
  updateMediaSettings,
  createProcessingSnapshot,
} from '../../../src/server/media/settings.ts';
import { initialMediaSettings } from '../../../src/server/media/validation.ts';
import {
  createWatermarkAsset,
  cleanupWatermarkAssets,
  getWatermarkAsset,
} from '../../../src/server/media/watermark-assets.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
const now = new Date('2026-09-29T00:00:00Z');
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-watermark-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction(prepareInitialMedia);
  mkdirSync(join(directory, 'watermarks'));
  mkdirSync(join(directory, 'storage'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function context() {
  return {
    db: connection.db,
    watermarksRoot: join(directory, 'watermarks'),
    hasUploadReference: () => false,
  };
}
const upload = () =>
  createWatermarkAsset(
    context(),
    readFileSync('tests/fixtures/media-formats/source.png'),
    new AbortController().signal,
    now,
  );
it('preserves unique immutable bytes and expires exactly after one hour', async () => {
  const a = await upload();
  const b = await upload();
  expect(a.id).not.toBe(b.id);
  expect(a.path).not.toBe(b.path);
  expect(readFileSync(join(context().watermarksRoot, a.path))).toEqual(
    readFileSync('tests/fixtures/media-formats/source.png'),
  );
  expect(a.expiresAt).toEqual(new Date(now.getTime() + 3600000));
  await cleanupWatermarkAssets(context(), new Date(now.getTime() + 3599999));
  expect(existsSync(join(context().watermarksRoot, a.path))).toBe(true);
  await cleanupWatermarkAssets(context(), new Date(now.getTime() + 3600000));
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('deleted');
  expect(existsSync(join(context().watermarksRoot, a.path))).toBe(false);
});
it('adopts inside settings transaction and keeps the immutable snapshot after replacement', async () => {
  const a = await upload();
  const input = {
    ...initialMediaSettings,
    watermarkMode: 'image',
    watermarkAssetId: a.id,
  };
  expect(() =>
    connection.db.transaction((tx) => {
      updateMediaSettings(tx, input, now);
      throw new Error('rollback');
    }),
  ).toThrow('rollback');
  expect(getWatermarkAsset(connection.db, a.id)?.expiresAt).toEqual(
    a.expiresAt,
  );
  connection.db.transaction((tx) => updateMediaSettings(tx, input, now));
  const snapshot = connection.db.transaction(createProcessingSnapshot);
  expect(snapshot.watermarkAsset).toMatchObject({
    id: a.id,
    path: a.path,
    format: 'PNG',
  });
  expect(getWatermarkAsset(connection.db, a.id)?.expiresAt).toBeNull();
  const later = new Date(now.getTime() + 7200000);
  connection.db.transaction((tx) => updateMediaSettings(tx, input, later));
  await cleanupWatermarkAssets(context(), later);
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  connection.db.transaction((tx) =>
    updateMediaSettings(tx, initialMediaSettings, later),
  );
  await cleanupWatermarkAssets(context(), later);
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('deleted');
  expect(snapshot.watermarkAsset?.id).toBe(a.id);
});

it('rejects expired and cleanup-marked assets and never adopts on a failed save', async () => {
  const a = await upload();
  const input = {
    ...initialMediaSettings,
    watermarkMode: 'image',
    watermarkAssetId: a.id,
  };
  const expires = new Date(now.getTime() + 3600000);
  expect(() =>
    connection.db.transaction((tx) => updateMediaSettings(tx, input, expires)),
  ).toThrowError(
    expect.objectContaining({ code: 'MEDIA_WATERMARK_UNAVAILABLE' }),
  );
  expect(getWatermarkAsset(connection.db, a.id)?.expiresAt).toEqual(expires);
  connection.db
    .update(mediaWatermarkAssets)
    .set({ status: 'cleanup_pending' })
    .where(eq(mediaWatermarkAssets.id, a.id))
    .run();
  expect(() =>
    connection.db.transaction((tx) => updateMediaSettings(tx, input, now)),
  ).toThrow();
});

it('preserves selected image parameters while off/text but omits unused assets from new snapshots', async () => {
  const a = await upload();
  for (const watermarkMode of ['off', 'text'] as const) {
    connection.db.transaction((tx) =>
      updateMediaSettings(
        tx,
        { ...initialMediaSettings, watermarkMode, watermarkAssetId: a.id },
        now,
      ),
    );
    expect(
      connection.db.transaction(createProcessingSnapshot).watermarkAsset,
    ).toBeNull();
    await cleanupWatermarkAssets(context(), new Date(now.getTime() + 7200000));
    expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  }
});

it('keeps preview references beyond asset expiry, across reopen, and releases only the named preview', async () => {
  const a = await upload();
  const snapshot = connection.db.transaction((tx) =>
    retainPreviewWatermark(tx, 'preview-a', a.id, now),
  );
  connection.db.transaction((tx) =>
    retainPreviewWatermark(tx, 'preview-b', a.id, now),
  );
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  const later = new Date(now.getTime() + 7200000);
  recoverWatermarkAssets(connection.db);
  await cleanupWatermarkAssets(context(), later);
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  connection.db.transaction((tx) => releasePreviewWatermark(tx, 'preview-a'));
  await cleanupWatermarkAssets(context(), later);
  expect(existsSync(join(context().watermarksRoot, a.path))).toBe(true);
  connection.db.transaction((tx) => releasePreviewWatermark(tx, 'preview-b'));
  await cleanupWatermarkAssets(context(), later);
  expect(existsSync(join(context().watermarksRoot, a.path))).toBe(false);
  expect(snapshot.id).toBe(a.id);
});

it('keeps queued, running and automatic retry snapshots, then releases final failures without losing history', async () => {
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  const a = await upload();
  connection.db.transaction((tx) =>
    updateMediaSettings(
      tx,
      {
        ...initialMediaSettings,
        watermarkMode: 'image',
        watermarkAssetId: a.id,
      },
      now,
    ),
  );
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: resolveLocalUploadStorage(tx).id,
      key: 'original.png',
      originalName: 'original.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 32,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['thumbnail', 'watermark'],
    }),
  );
  connection.db.transaction((tx) =>
    updateMediaSettings(tx, initialMediaSettings, now),
  );
  await cleanupWatermarkAssets(context());
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  const job = claimNextMediaJob(connection.db)!;
  expect(job.id).toBe(accepted.jobId);
  await cleanupWatermarkAssets(context());
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  settleMediaFailure(
    connection.db,
    job.id,
    'watermark',
    Object.assign(new Error('temporary'), { code: 'EIO' }),
  );
  expect(connection.db.select().from(mediaJobs).get()?.status).toBe('queued');
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  recoverWatermarkAssets(connection.db);
  await cleanupWatermarkAssets(context());
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  connection.db.update(mediaJobs).set({ nextAttemptAt: null }).run();
  claimNextMediaJob(connection.db);
  settleMediaFailure(
    connection.db,
    job.id,
    'watermark',
    Object.assign(new Error('temporary again'), { code: 'EIO' }),
  );
  expect(connection.db.select().from(mediaJobs).get()?.status).toBe('failed');
  await cleanupWatermarkAssets(context());
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('deleted');
  expect(
    connection.db.select().from(mediaJobs).get()?.snapshot.watermarkAsset,
  ).toMatchObject({ id: a.id, byteSize: a.byteSize });
});

it.each(['succeeded', 'cancelled'] as const)(
  'does not pin %s content task history',
  async (status) => {
    prepareInitialStorage(connection.db, {
      storage: join(directory, 'storage'),
    });
    const a = await upload();
    connection.db.transaction((tx) =>
      updateMediaSettings(
        tx,
        {
          ...initialMediaSettings,
          watermarkMode: 'image',
          watermarkAssetId: a.id,
        },
        now,
      ),
    );
    connection.db.transaction((tx) =>
      acceptOriginal(tx, {
        imageId: randomUUID(),
        storageId: resolveLocalUploadStorage(tx).id,
        key: 'original.png',
        originalName: 'original.png',
        visibility: 'public',
        format: 'PNG',
        mime: 'image/png',
        byteSize: 32,
        snapshot: createProcessingSnapshot(tx),
        expectedVersions: ['thumbnail'],
      }),
    );
    connection.db.transaction((tx) =>
      updateMediaSettings(tx, initialMediaSettings, now),
    );
    connection.db.update(mediaJobs).set({ status }).run();
    await cleanupWatermarkAssets(context());
    expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('deleted');
    expect(
      connection.db.select().from(mediaJobs).get()?.snapshot.watermarkAsset?.id,
    ).toBe(a.id);
  },
);

it('keeps upload snapshots until every session is terminal or hands responsibility to a content task', async () => {
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  const a = await upload();
  connection.db.transaction((tx) =>
    updateMediaSettings(
      tx,
      {
        ...initialMediaSettings,
        watermarkMode: 'image',
        watermarkAssetId: a.id,
      },
      now,
    ),
  );
  const submission = createSubmission(connection.db, {
    requestId: randomUUID(),
    files: [1, 2].map(() => ({
      queueItemId: randomUUID(),
      originalName: 'test.png',
      declaredSize: 64,
    })),
  });
  const externalContext = {
    ...context(),
    hasUploadReference: hasUploadWatermarkReference,
  };
  connection.db.transaction((tx) =>
    updateMediaSettings(tx, initialMediaSettings, now),
  );
  for (const state of [
    'queued',
    'receiving',
    'validating',
    'finalizing',
  ] as const) {
    connection.db.update(uploadSessions).set({ state }).run();
    await cleanupWatermarkAssets(externalContext);
    expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  }
  cancelSession(connection.db, submission.sessions[0].id);
  await cleanupWatermarkAssets(externalContext);
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  connection.db
    .update(uploadSessions)
    .set({ finalKey: 'fixed.png', byteSize: 64 })
    .where(eq(uploadSessions.id, submission.sessions[1].id))
    .run();
  const accepted = acceptSession(connection.db, submission.sessions[1].id, {
    format: 'PNG',
    mime: 'image/png',
    width: 8,
    height: 8,
    coder: 'png',
    extension: 'png',
  });
  expect(
    connection.db.transaction((tx) => hasUploadWatermarkReference(tx, a.id)),
  ).toBe(false);
  await cleanupWatermarkAssets(externalContext);
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('ready');
  connection.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.id, accepted.jobId!))
    .run();
  await cleanupWatermarkAssets(externalContext);
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('deleted');
});

it('retains failed cleanup responsibility and retries after restart without touching unrelated files', async () => {
  const a = await upload();
  const other = join(context().watermarksRoot, 'unrelated');
  mkdirSync(other);
  const assetDirectory = join(context().watermarksRoot, a.id);
  chmodSync(assetDirectory, 0o500);
  const later = new Date(now.getTime() + 7200000);
  try {
    const failures = await cleanupWatermarkAssets(context(), later);
    expect(failures).toHaveLength(1);
    expect(getWatermarkAsset(connection.db, a.id)).toMatchObject({
      status: 'cleanup_failed',
      path: a.path,
      error: expect.stringContaining(a.id),
    });
  } finally {
    chmodSync(assetDirectory, 0o700);
  }
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  recoverWatermarkAssets(connection.db);
  expect(await cleanupWatermarkAssets(context(), later)).toEqual([]);
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('deleted');
  expect(existsSync(assetDirectory)).toBe(false);
  expect(existsSync(other)).toBe(true);
});

it('does not delete active writes and recovers a crashed write by its registered path', async () => {
  const id = randomUUID();
  const path = `${id}/source`;
  connection.db
    .insert(mediaWatermarkAssets)
    .values({
      id,
      path,
      byteSize: 10,
      status: 'writing',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  mkdirSync(join(context().watermarksRoot, id));
  writeFileSync(join(context().watermarksRoot, path), 'partial');
  await cleanupWatermarkAssets(context());
  expect(existsSync(join(context().watermarksRoot, path))).toBe(true);
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  recoverWatermarkAssets(connection.db);
  await cleanupWatermarkAssets(context());
  expect(getWatermarkAsset(connection.db, id)?.status).toBe('deleted');
});

it('accepts exactly 5 MiB and rejects oversized or empty files before registering ownership', async () => {
  const png = readFileSync('tests/fixtures/media-formats/source.png');
  // A valid private ancillary chunk makes the actual PNG exactly 5 MiB.
  const data = Buffer.alloc(5 * 1024 * 1024 - png.length - 12, 32);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write('arIs', 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  const bytes = Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
  const asset = await createWatermarkAsset(
    context(),
    bytes,
    new AbortController().signal,
    now,
  );
  expect(asset.byteSize).toBe(5 * 1024 * 1024);
  expect(
    readFileSync(join(context().watermarksRoot, asset.path)).equals(bytes),
  ).toBe(true);
  for (const invalid of [Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1)])
    await expect(
      createWatermarkAsset(context(), invalid, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'MEDIA_WATERMARK_SIZE' });
  expect(connection.db.select().from(mediaWatermarkAssets).all()).toHaveLength(
    1,
  );
});

it('rejects new references after cleanup is claimed, including from a second connection', async () => {
  const a = await upload();
  connection.db.transaction((tx) =>
    updateMediaSettings(
      tx,
      { ...initialMediaSettings, watermarkAssetId: a.id },
      now,
    ),
  );
  connection.db.transaction((tx) =>
    updateMediaSettings(tx, initialMediaSettings, now),
  );
  const cleanup = cleanupWatermarkAssets(context());
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe(
    'cleanup_pending',
  );
  const other = openRuntimeDatabase(join(directory, 'ariso.db'));
  try {
    expect(() =>
      other.db.transaction((tx) =>
        updateMediaSettings(
          tx,
          { ...initialMediaSettings, watermarkAssetId: a.id },
          now,
        ),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'MEDIA_WATERMARK_UNAVAILABLE' }),
    );
    expect(() =>
      other.db.transaction((tx) =>
        retainPreviewWatermark(tx, 'late-preview', a.id, now),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'MEDIA_WATERMARK_UNAVAILABLE' }),
    );
  } finally {
    other.close();
  }
  await cleanup;
  expect(getWatermarkAsset(connection.db, a.id)?.status).toBe('deleted');
});

it('persists the resource failure that cancelled decoding rather than a generic abort', async () => {
  const resources = createMediaResources();
  const beginStep = resources.beginStep;
  const failure = Object.assign(
    new Error('Insufficient disk space at watermark workspace'),
    { code: 'INSUFFICIENT_DISK_SPACE' },
  );
  resources.beginStep = (options) => {
    const budget = beginStep(options);
    return { ...budget, signal: AbortSignal.abort(failure) };
  };
  await expect(
    createWatermarkAsset(
      { ...context(), resources },
      readFileSync('tests/fixtures/media-formats/source.png'),
      new AbortController().signal,
      now,
    ),
  ).rejects.toBe(failure);
  expect(connection.db.select().from(mediaWatermarkAssets).get()).toMatchObject(
    { status: 'cleanup_pending', error: failure.message },
  );
});
