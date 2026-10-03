import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as files from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { execa } from 'execa';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  readObject,
  writeObject,
} from '../../../src/server/storage/local.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import {
  claimNextMediaJob,
  startMediaQueue,
} from '../../../src/server/media/queue.ts';
import {
  claimNextPreview,
  processMediaPreview,
  queuePreview,
  requirePreview,
  startPreviewRuntime,
} from '../../../src/server/media/previews.ts';
import {
  mediaPreviews,
  mediaWatermarkPreviewRefs,
  mediaJobs,
} from '../../../src/server/media/schema.ts';
import {
  createWatermarkAsset,
  watermarkAssetSnapshot,
} from '../../../src/server/media/watermark-assets.ts';
import {
  previewSettingsSchema,
  type PreviewInput,
} from '../../../src/server/media/preview-validation.ts';
import {
  type ProcessingSnapshot,
  initialMediaSettings,
} from '../../../src/server/media/validation.ts';
import * as tools from '../../../src/server/media/tools.ts';
import { createMediaResources } from '../../../src/server/media/resources.ts';

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, createWriteStream: actual.createWriteStream };
});
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, rm: actual.rm };
});

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
let source: Buffer;
const stops: Array<() => Promise<unknown>> = [];
const releases: Array<() => void> = [];
beforeEach(async () => {
  directory = await files.mkdtemp(join(tmpdir(), 'ariso-preview-'));
  for (const child of ['storage', 'tmp', 'watermarks'])
    await files.mkdir(join(directory, child));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  runtime = {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    watermarksRoot: join(directory, 'watermarks'),
    logger: createRuntimeLogger('preview.test', 'fatal'),
  };
  source = Buffer.from(
    (
      await execa(
        'magick',
        [
          '-size',
          '80x40',
          'xc:none',
          '-fill',
          'red',
          '-draw',
          'rectangle 0,0 39,39',
          'png:-',
        ],
        { encoding: 'buffer' },
      )
    ).stdout,
  );
});
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const stop of stops.splice(0)) await stop();
  vi.restoreAllMocks();
  connection.close();
  await files.rm(directory, { recursive: true, force: true });
});
function settings(changes: Partial<PreviewInput['settings']> = {}) {
  const { defaultLinkVersion, defaultVisibility, concurrency, ...rendering } =
    initialMediaSettings;
  void defaultLinkVersion;
  void defaultVisibility;
  void concurrency;
  return previewSettingsSchema.parse({ ...rendering, ...changes });
}
async function enqueue(
  target: PreviewInput['target'],
  changes: Partial<PreviewInput['settings']> = {},
  bytes = source,
) {
  const id = randomUUID();
  const now = new Date();
  runtime.db
    .insert(mediaPreviews)
    .values({
      id,
      status: 'receiving',
      cleanupStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  await files.mkdir(join(runtime.temporaryRoot, `preview-${id}`));
  await files.writeFile(
    join(runtime.temporaryRoot, `preview-${id}`, 'source'),
    bytes,
  );
  queuePreview(runtime, id, { target, settings: settings(changes) });
  return id;
}
async function preview(
  target: PreviewInput['target'],
  changes: Partial<PreviewInput['settings']> = {},
  bytes = source,
) {
  const id = await enqueue(target, changes, bytes);
  expect(claimNextPreview(runtime)?.id).toBe(id);
  await processMediaPreview(runtime, id);
  return requirePreview(runtime, id);
}
async function accepted(
  changes: Partial<PreviewInput['settings']> = {},
  bytes = source,
  format: 'PNG' | 'SVG' = 'PNG',
) {
  const form = settings(changes);
  const { watermarkAssetId, ...rendering } = form;
  const snapshot: ProcessingSnapshot = {
    ...connection.db.transaction(createProcessingSnapshot),
    ...rendering,
    watermarkAsset:
      form.watermarkMode === 'image'
        ? watermarkAssetSnapshot(runtime.db, watermarkAssetId!)
        : null,
  };
  const storage = resolveLocalUploadStorage(runtime.db);
  const plan = planLocalWrite('uploads');
  await writeObject(runtime.storageRoot, storage, plan, Readable.from(bytes));
  return runtime.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: format === 'SVG' ? 'source.svg' : 'source.png',
      visibility: 'private',
      format,
      mime: format === 'SVG' ? 'image/svg+xml' : 'image/png',
      byteSize: bytes.length,
      snapshot,
      expectedVersions: [
        ...(snapshot.compressionEnabled ? ['compressed' as const] : []),
        'thumbnail',
        ...(snapshot.watermarkMode === 'off' ? [] : ['watermark' as const]),
      ],
    }),
  );
}
async function formalVersion(imageId: string, kind: PreviewInput['target']) {
  const version = getImageAccessState(runtime.db, imageId)!.versions.find(
    (v) => v.kind === kind,
  )!.saved!;
  const object = await readObject(
    runtime.storageRoot,
    resolveLocalUploadStorage(runtime.db, version.object.storageId),
    version.object.key,
    version.version.mime,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
  return { bytes: Buffer.concat(chunks), version: version.version };
}
function businessState() {
  const tables = connection.db.$client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('media_previews', 'media_watermark_preview_refs', 'sqlite_sequence') ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      connection.db.$client
        .prepare(`SELECT * FROM "${name}" ORDER BY rowid`)
        .all(),
    ]),
  );
}
async function imageAsset() {
  const bytes = Buffer.from(
    (
      await execa('magick', ['-size', '12x8', 'xc:blue', 'png:-'], {
        encoding: 'buffer',
      })
    ).stdout,
  );
  return createWatermarkAsset(
    {
      db: runtime.db,
      watermarksRoot: runtime.watermarksRoot!,
      hasUploadReference: () => false,
    },
    bytes,
    new AbortController().signal,
  );
}
function holdEncodingSettlement(command: 'magick' | 'node' = 'magick') {
  const actual = tools.startMediaTool;
  const entered = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  releases.push(() => gate.resolve());
  const injected: typeof tools.startMediaTool = (
    toolCommand,
    args,
    options,
  ) => {
    const tool = actual(toolCommand, args, options);
    if (
      toolCommand !== command ||
      (command === 'magick' &&
        (typeof options.buffer !== 'object' || options.buffer.stdout !== false))
    )
      return tool;
    return {
      ...tool,
      settled: tool.settled.then(async (error) => {
        entered.resolve();
        await gate.promise;
        return error;
      }),
    };
  };
  vi.spyOn(tools, 'startMediaTool').mockImplementation(injected);
  return { entered: entered.promise, release: () => gate.resolve() };
}

describe('temporary previews use the real formal encoding pipeline', () => {
  it.each([
    {
      size: 'viewBox-only',
      attributes: 'viewBox="0 0 80 40"',
      width: 80,
      height: 40,
    },
    {
      size: 'physical units',
      attributes: 'width="2in" height="1in"',
      width: 192,
      height: 96,
    },
  ])(
    'original SVG with $size matches actual formal properties and preserves source bytes',
    async ({ attributes, width, height }) => {
      const bytes = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="100%" height="100%" fill="red"/></svg>`,
      );
      const original = await accepted({}, bytes, 'SVG');
      await processMediaJob(runtime, claimNextMediaJob(runtime.db)!.id);
      expect(
        getImageAccessState(runtime.db, original.imageId)!.latestJob,
      ).toMatchObject({ status: 'succeeded', error: null });
      const expected = await formalVersion(original.imageId, 'original');
      expect(expected.version).toMatchObject({
        format: 'SVG',
        mime: 'image/svg+xml',
        width,
        height,
        byteSize: bytes.length,
      });
      expect(expected.bytes).toEqual(bytes);
      const before = businessState();
      const row = await preview('original', {}, bytes);
      expect(row).toMatchObject({
        status: 'succeeded',
        error: null,
        unavailableReason: null,
      });
      expect(row.result).toEqual({
        format: expected.version.format,
        mime: expected.version.mime,
        width: expected.version.width,
        height: expected.version.height,
        byteSize: expected.bytes.length,
      });
      expect(
        await files.readFile(
          join(runtime.temporaryRoot, `preview-${row.id}`, 'result'),
        ),
      ).toEqual(expected.bytes);
      expect(businessState()).toEqual(before);
    },
  );
  it.each([
    { target: 'original', changes: {} },
    {
      target: 'thumbnail',
      changes: { outputFormat: 'jpeg', maxEdge: 20, quality: 13 },
    },
    ...(['jpeg', 'webp', 'avif'] as const).map((outputFormat) => ({
      target: 'compressed',
      changes: {
        outputFormat,
        maxEdge: 40,
        quality: 61,
        jpegBackground: '#0000FF',
      },
    })),
    ...([false, true] as const).map((compressionEnabled) => ({
      target: 'watermark',
      changes: {
        compressionEnabled,
        watermarkMode: 'text',
        watermarkText: 'Ariso',
        watermarkFont: 'latin',
        watermarkFontSize: 10,
        watermarkOpacity: 75,
        maxEdge: 40,
      },
    })),
  ] as Array<{
    target: PreviewInput['target'];
    changes: Partial<PreviewInput['settings']>;
  }>)(
    '$target with $changes matches actual formal bytes and leaves every business table unchanged',
    async ({ target, changes }) => {
      const original = await accepted(changes);
      const job = claimNextMediaJob(runtime.db)!;
      await processMediaJob(runtime, job.id);
      expect(
        getImageAccessState(runtime.db, original.imageId)!.latestJob?.error,
      ).toBeNull();
      const expected = await formalVersion(original.imageId, target);
      const before = businessState();
      const row = await preview(target, changes);
      expect(row.error).toBeNull();
      expect(row.status).toBe('succeeded');
      expect(row.result).toEqual({
        format: expected.version.format,
        mime: expected.version.mime,
        width: expected.version.width,
        height: expected.version.height,
        byteSize: expected.bytes.length,
      });
      expect(
        await files.readFile(
          join(runtime.temporaryRoot, `preview-${row.id}`, 'result'),
        ),
      ).toEqual(expected.bytes);
      expect(businessState()).toEqual(before);
      expect(row.expiresAt!.getTime() - row.finishedAt!.getTime()).toBe(
        30 * 60 * 1000,
      );
    },
  );
  it.each([false, true])(
    'image watermark (compression=%s) matches actual formal bytes and releases its temporary reference',
    async (compressionEnabled) => {
      const asset = await imageAsset();
      const changes = {
        compressionEnabled,
        watermarkMode: 'image' as const,
        watermarkAssetId: asset.id,
        watermarkOpacity: 100,
        watermarkWidth: 20,
        maxEdge: 40,
      };
      const original = await accepted(changes);
      await processMediaJob(runtime, claimNextMediaJob(runtime.db)!.id);
      const expected = await formalVersion(original.imageId, 'watermark');
      const before = businessState();
      const row = await preview('watermark', changes);
      expect(row.error).toBeNull();
      expect(row.result).toMatchObject({
        format: expected.version.format,
        width: expected.version.width,
        height: expected.version.height,
        byteSize: expected.bytes.length,
      });
      expect(
        await files.readFile(
          join(runtime.temporaryRoot, `preview-${row.id}`, 'result'),
        ),
      ).toEqual(expected.bytes);
      expect(runtime.db.select().from(mediaWatermarkPreviewRefs).all()).toEqual(
        [],
      );
      expect(businessState()).toEqual(before);
    },
  );
  it.each([
    ['compressed', { compressionEnabled: false }, '压缩开关已关闭'],
    ['watermark', { watermarkMode: 'off' }, '水印已关闭'],
  ] as const)(
    'explains disabled %s without fabricating an output',
    async (target, changes, reason) => {
      const row = await preview(target, changes);
      expect(row).toMatchObject({
        status: 'succeeded',
        result: null,
        unavailableReason: reason,
      });
      await expect(
        files.stat(join(runtime.temporaryRoot, `preview-${row.id}`, 'result')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
  it.each(['compressed', 'watermark'] as const)(
    'explains why an animated GIF cannot produce %s',
    async (target) => {
      const bytes = await files.readFile(
        resolve('tests/fixtures/media-formats/animated.gif'),
      );
      const row = await preview(
        target,
        { watermarkMode: 'text', watermarkText: 'Ariso' },
        bytes,
      );
      expect(row).toMatchObject({
        status: 'succeeded',
        result: null,
        unavailableReason: '该格式为动画或仅支持预览，不适用压缩和水印',
      });
    },
  );
});

describe('preview lifetime and owned resources', () => {
  it('awaits original SVG preparation settlement on cancellation before deleting files or releasing its disk budget', async () => {
    const previews = startPreviewRuntime(runtime);
    stops.push(() => previews.stop());
    await previews.ready;
    runtime.resources = createMediaResources();
    const beginStep = vi.spyOn(runtime.resources, 'beginStep');
    const bytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect width="80" height="40" fill="red"/></svg>',
    );
    const id = await enqueue('original', {}, bytes);
    expect(claimNextPreview(runtime)?.id).toBe(id);
    const held = holdEncodingSettlement('node');
    const running = previews.run(id, new AbortController().signal);
    await held.entered;
    const budget = beginStep.mock.results[0].value as ReturnType<
      typeof runtime.resources.beginStep
    >;
    const close = vi.spyOn(budget, 'close');
    let cancelled = false;
    const cancellation = previews.cancel(id).then(() => {
      cancelled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cancelled).toBe(false);
    expect(requirePreview(runtime, id)).toMatchObject({
      status: 'running',
      result: null,
    });
    expect(close).not.toHaveBeenCalled();
    expect(
      await files.readFile(
        join(runtime.temporaryRoot, `preview-${id}`, 'source'),
      ),
    ).toEqual(bytes);
    expect(
      (
        await files.stat(
          join(runtime.temporaryRoot, `preview-${id}`, 'work', 'preview.png'),
        )
      ).isFile(),
    ).toBe(true);
    await expect(
      files.stat(join(runtime.temporaryRoot, `preview-${id}`, 'result')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    held.release();
    await Promise.all([running, cancellation]);
    expect(close).toHaveBeenCalledOnce();
    expect(requirePreview(runtime, id)).toMatchObject({
      status: 'cancelled',
      result: null,
      cleanupStatus: 'deleted',
      error: expect.stringContaining('MEDIA_CANCELLED'),
    });
    await expect(
      files.stat(join(runtime.temporaryRoot, `preview-${id}`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains a private result until exactly 30 minutes and removes it at expiry', async () => {
    const previews = startPreviewRuntime(runtime);
    stops.push(() => previews.stop());
    await previews.ready;
    const row = await preview('compressed', { quality: 49 });
    const response = await previews.result(row.id);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      await files.readFile(
        join(runtime.temporaryRoot, `preview-${row.id}`, 'result'),
      ),
    );
    await previews.maintenance(new Date(row.expiresAt!.getTime() - 1));
    expect(requirePreview(runtime, row.id).status).toBe('succeeded');
    await previews.maintenance(row.expiresAt!);
    expect(requirePreview(runtime, row.id)).toMatchObject({
      status: 'expired',
      cleanupStatus: 'deleted',
    });
    await expect(previews.result(row.id)).rejects.toMatchObject({
      code: 'MEDIA_PREVIEW_EXPIRED',
      status: 410,
    });
    await expect(
      files.stat(join(runtime.temporaryRoot, `preview-${row.id}`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('records ENOSPC from output writing, publishes no partial result and removes owned files', async () => {
    const id = await enqueue('compressed');
    expect(claimNextPreview(runtime)?.id).toBe(id);
    const actual = fs.createWriteStream;
    vi.spyOn(fs, 'createWriteStream').mockImplementation((path, options) => {
      const stream = actual(path, options);
      if (
        String(path) === join(runtime.temporaryRoot, `preview-${id}`, 'result')
      ) {
        queueMicrotask(() =>
          stream.destroy(
            Object.assign(
              new Error('No space left on device while writing preview'),
              { code: 'ENOSPC' },
            ),
          ),
        );
      }
      return stream;
    });
    await processMediaPreview(runtime, id);
    expect(requirePreview(runtime, id)).toMatchObject({
      status: 'failed',
      result: null,
      cleanupStatus: 'deleted',
      error: expect.stringContaining('INSUFFICIENT_DISK_SPACE'),
    });
    await expect(
      files.stat(join(runtime.temporaryRoot, `preview-${id}`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('awaits encoding settlement on cancellation before deleting files or releasing the image watermark', async () => {
    const previews = startPreviewRuntime(runtime);
    stops.push(() => previews.stop());
    await previews.ready;
    const asset = await imageAsset();
    const id = await enqueue('watermark', {
      compressionEnabled: false,
      watermarkMode: 'image',
      watermarkAssetId: asset.id,
    });
    expect(claimNextPreview(runtime)?.id).toBe(id);
    const held = holdEncodingSettlement();
    const running = previews.run(id, new AbortController().signal);
    await held.entered;
    let cancelled = false;
    const cancellation = previews.cancel(id).then(() => {
      cancelled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cancelled).toBe(false);
    expect(requirePreview(runtime, id).status).toBe('running');
    expect(runtime.db.select().from(mediaWatermarkPreviewRefs).all()).toEqual([
      { previewId: id, assetId: asset.id },
    ]);
    expect(
      (
        await files.stat(join(runtime.temporaryRoot, `preview-${id}`))
      ).isDirectory(),
    ).toBe(true);
    held.release();
    await Promise.all([running, cancellation]);
    expect(requirePreview(runtime, id)).toMatchObject({
      status: 'cancelled',
      result: null,
      cleanupStatus: 'deleted',
      error: expect.stringContaining('MEDIA_CANCELLED'),
    });
    expect(runtime.db.select().from(mediaWatermarkPreviewRefs).all()).toEqual(
      [],
    );
    await expect(
      files.stat(join(runtime.temporaryRoot, `preview-${id}`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps cleanup failures visible and retains material references until a retry settles', async () => {
    const previews = startPreviewRuntime(runtime);
    stops.push(() => previews.stop());
    await previews.ready;
    const asset = await imageAsset();
    const id = await enqueue('watermark', {
      watermarkMode: 'image',
      watermarkAssetId: asset.id,
    });
    const owned = join(runtime.temporaryRoot, `preview-${id}`);
    const actual = files.rm;
    const failure = Object.assign(
      new Error('Permission denied removing owned preview directory'),
      { code: 'EACCES' },
    );
    const injected = vi
      .spyOn(files, 'rm')
      .mockImplementation((path, options) =>
        String(path) === owned
          ? Promise.reject(failure)
          : actual(path, options),
      );
    await previews.cancel(id);
    expect(requirePreview(runtime, id)).toMatchObject({
      status: 'cancelled',
      cleanupStatus: 'failed',
      cleanupError: expect.stringContaining(failure.message),
    });
    expect(runtime.db.select().from(mediaWatermarkPreviewRefs).all()).toEqual([
      { previewId: id, assetId: asset.id },
    ]);
    injected.mockRestore();
    await previews.maintenance();
    expect(requirePreview(runtime, id)).toMatchObject({
      status: 'cancelled',
      cleanupStatus: 'deleted',
      cleanupError: expect.stringContaining(failure.message),
    });
    expect(runtime.db.select().from(mediaWatermarkPreviewRefs).all()).toEqual(
      [],
    );
    await expect(files.stat(owned)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('restarts with exact registered directories only and holds watermark references until recovery cleanup settles', async () => {
    const successful = await preview('thumbnail');
    const asset = await imageAsset();
    const id = await enqueue('watermark', {
      watermarkMode: 'image',
      watermarkAssetId: asset.id,
    });
    expect(claimNextPreview(runtime)?.id).toBe(id);
    const queued = await enqueue('original');
    const owned = join(runtime.temporaryRoot, `preview-${id}`);
    const unrelated = join(runtime.temporaryRoot, `preview-${id}-other-task`);
    await files.mkdir(unrelated);
    await files.writeFile(join(unrelated, 'source'), 'keep');
    await files.mkdir(join(runtime.temporaryRoot, 'upload-other-task'));
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    releases.push(() => gate.resolve());
    const actual = tools.terminateMediaTools;
    vi.spyOn(tools, 'terminateMediaTools').mockImplementation(
      async (workspace) => {
        if (workspace === join(owned, 'work')) {
          entered.resolve();
          await gate.promise;
        }
        return actual(workspace);
      },
    );
    const previews = startPreviewRuntime(runtime);
    stops.push(() => previews.stop());
    await entered.promise;
    expect(requirePreview(runtime, id)).toMatchObject({
      status: 'cancelled',
      cleanupStatus: 'pending',
      error: expect.stringContaining('MEDIA_INTERRUPTED'),
    });
    expect(runtime.db.select().from(mediaWatermarkPreviewRefs).all()).toEqual([
      { previewId: id, assetId: asset.id },
    ]);
    gate.resolve();
    await previews.ready;
    expect(requirePreview(runtime, id).cleanupStatus).toBe('deleted');
    expect(requirePreview(runtime, queued)).toMatchObject({
      status: 'cancelled',
      cleanupStatus: 'deleted',
    });
    expect(requirePreview(runtime, successful.id)).toMatchObject({
      status: 'expired',
      cleanupStatus: 'deleted',
    });
    expect(runtime.db.select().from(mediaWatermarkPreviewRefs).all()).toEqual(
      [],
    );
    expect(await files.readFile(join(unrelated, 'source'), 'utf8')).toBe(
      'keep',
    );
    expect(
      (
        await files.stat(join(runtime.temporaryRoot, 'upload-other-task'))
      ).isDirectory(),
    ).toBe(true);
  });

  it.each(['preview', 'media'] as const)(
    'shares the single queue slot when %s starts first',
    async (first) => {
      const held = holdEncodingSettlement();
      const queue = startMediaQueue(runtime);
      stops.push(() => queue.stop());
      await queue.previews.ready;
      // Drain synchronous startup/recovery before registering newly submitted work.
      await new Promise<void>((resolve) => setImmediate(resolve));
      let previewId: string;
      let media: Awaited<ReturnType<typeof accepted>>;
      if (first === 'preview') {
        previewId = await enqueue('compressed');
        await held.entered;
        media = await accepted();
      } else {
        media = await accepted();
        await held.entered;
        previewId = await enqueue('compressed');
      }
      expect(requirePreview(runtime, previewId).status).toBe(
        first === 'preview' ? 'running' : 'queued',
      );
      expect(
        runtime.db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.id, media.jobId))
          .get()!.status,
      ).toBe(first === 'media' ? 'running' : 'queued');
      held.release();
      await vi.waitFor(
        () => {
          expect(requirePreview(runtime, previewId).status).toBe('succeeded');
          expect(
            getImageAccessState(runtime.db, media.imageId)!.latestJob!.status,
          ).toBe('succeeded');
        },
        { timeout: 4000, interval: 30 },
      );
    },
  );
});

function previewRequest(
  options = JSON.stringify({ target: 'compressed', settings: settings() }),
) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(source)]), 'source.png');
  form.append('options', options);
  return new Request('http://localhost/api/media/previews', {
    method: 'POST',
    body: form,
  });
}

it('keeps a failed receive addressable by its previewId when directory cleanup fails', async () => {
  const previews = startPreviewRuntime(runtime);
  stops.push(() => previews.stop());
  await previews.ready;
  const actual = files.rm;
  const failure = Object.assign(
    new Error('Preview receive directory cannot be removed'),
    { code: 'EACCES' },
  );
  const injected = vi
    .spyOn(files, 'rm')
    .mockImplementation((path, options) =>
      String(path).startsWith(join(runtime.temporaryRoot, 'preview-'))
        ? Promise.reject(failure)
        : actual(path, options),
    );
  const error = (await previews
    .receive(previewRequest('{'))
    .catch((cause: unknown) => cause)) as Error & { previewId: string };
  expect(error).toBeInstanceOf(SyntaxError);
  expect(error.previewId).toEqual(expect.any(String));
  expect(previews.get(error.previewId)).toMatchObject({
    id: error.previewId,
    status: 'failed',
    cleanupStatus: 'failed',
    cleanupError: expect.stringContaining(failure.message),
    resultUrl: null,
  });
  injected.mockRestore();
  await previews.maintenance();
  expect(previews.get(error.previewId)).toMatchObject({
    cleanupStatus: 'deleted',
    cleanupError: expect.stringContaining(failure.message),
  });
});

it('waits for a pending source write before completing cancellation or releasing its disk reservation', async () => {
  const previews = startPreviewRuntime(runtime);
  stops.push(() => previews.stop());
  await previews.ready;
  const gate = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  releases.push(() => gate.resolve());
  const actual = files.open;
  vi.spyOn(files, 'open').mockImplementation(async (path, flags, mode) => {
    const handle = await actual(path, flags, mode);
    if (
      String(path).startsWith(join(runtime.temporaryRoot, 'preview-')) &&
      String(path).endsWith('/source')
    ) {
      const write = handle.write;
      vi.spyOn(handle, 'write').mockImplementation(async (...args) => {
        entered.resolve();
        await gate.promise;
        return Reflect.apply(write, handle, args) as ReturnType<typeof write>;
      });
    }
    return handle;
  });
  const received = previews.receive(previewRequest()).then(
    () => undefined,
    (error: unknown) => error,
  );
  await entered.promise;
  const row = runtime.db.select().from(mediaPreviews).get()!;
  const releaseWrite = vi.spyOn(runtime.resources!, 'releaseWrite');
  let cancelled = false;
  const cancellation = previews.cancel(row.id).then(() => {
    cancelled = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(cancelled).toBe(false);
  expect(requirePreview(runtime, row.id).status).toBe('receiving');
  expect(releaseWrite).not.toHaveBeenCalled();
  expect(
    (
      await files.stat(join(runtime.temporaryRoot, `preview-${row.id}`))
    ).isDirectory(),
  ).toBe(true);
  gate.resolve();
  await Promise.all([received, cancellation]);
  expect(releaseWrite).toHaveBeenCalledOnce();
  expect(requirePreview(runtime, row.id)).toMatchObject({
    status: 'cancelled',
    result: null,
    cleanupStatus: 'deleted',
  });
  await expect(
    files.stat(join(runtime.temporaryRoot, `preview-${row.id}`)),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

it('exposes previewId when receiving cleanup cannot confirm tool shutdown', async () => {
  const previews = startPreviewRuntime(runtime);
  stops.push(() => previews.stop());
  await previews.ready;
  const failure = Object.assign(
    new Error('Cannot confirm preview tool shutdown'),
    { code: 'MEDIA_TOOL_SHUTDOWN_FAILED' },
  );
  const actual = tools.terminateMediaTools;
  const injected = vi
    .spyOn(tools, 'terminateMediaTools')
    .mockImplementation((workspace) =>
      workspace.startsWith(join(runtime.temporaryRoot, 'preview-'))
        ? Promise.reject(failure)
        : actual(workspace),
    );
  const error = (await previews
    .receive(previewRequest('{'))
    .catch((cause: unknown) => cause)) as Error & {
    code: string;
    previewId: string;
  };
  expect(error).toBe(failure);
  expect(error).toMatchObject({
    code: 'MEDIA_TOOL_SHUTDOWN_FAILED',
    previewId: expect.any(String),
  });
  expect(previews.get(error.previewId)).toMatchObject({
    id: error.previewId,
    status: 'failed',
    cleanupStatus: 'failed',
    cleanupError: expect.stringContaining('MEDIA_TOOL_SHUTDOWN_FAILED'),
    resultUrl: null,
  });
  expect(
    (
      await files.stat(
        join(runtime.temporaryRoot, `preview-${error.previewId}`),
      )
    ).isDirectory(),
  ).toBe(true);
  injected.mockRestore();
});

it('propagates encoder tool shutdown failure after persisting its failed preview state', async () => {
  const id = await enqueue('compressed');
  expect(claimNextPreview(runtime)?.id).toBe(id);
  const failure = Object.assign(
    new Error('Encoder tool shutdown confirmation failed'),
    { code: 'MEDIA_TOOL_SHUTDOWN_FAILED' },
  );
  const actual = tools.startMediaTool;
  const injected: typeof tools.startMediaTool = (command, args, options) => {
    const tool = actual(command, args, options);
    if (
      command !== 'magick' ||
      typeof options.buffer !== 'object' ||
      options.buffer.stdout !== false
    )
      return tool;
    // Inject only after the real encoder has settled, so no live process is fabricated.
    return { ...tool, settled: tool.settled.then((error) => error ?? failure) };
  };
  vi.spyOn(tools, 'startMediaTool').mockImplementation(injected);
  await expect(processMediaPreview(runtime, id)).rejects.toBe(failure);
  expect(requirePreview(runtime, id)).toMatchObject({
    status: 'failed',
    result: null,
    error: expect.stringContaining('MEDIA_TOOL_SHUTDOWN_FAILED'),
    cleanupStatus: 'deleted',
  });
});
