import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { execa } from 'execa';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  readObject,
  writeObject,
} from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
  updateMediaSettings,
} from '../../../src/server/media/settings.ts';
import {
  initialMediaSettings,
  type ProcessingSnapshot,
} from '../../../src/server/media/validation.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import * as mediaTools from '../../../src/server/media/tools.ts';
import { recoverMediaJobs } from '../../../src/server/media/recovery.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-processing-'));
  await mkdir(join(directory, 'storage'));
  await mkdir(join(directory, 'tmp'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  runtime = {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger: createRuntimeLogger('media.test', 'fatal'),
  };
});
afterEach(async () => {
  connection.close();
  await rm(directory, { recursive: true, force: true });
});

async function accept(
  bytes: Buffer,
  changes: Partial<ProcessingSnapshot> = {},
) {
  const storage = resolveUploadStorage(connection.db);
  const plan = planLocalWrite('uploads');
  await writeObject(runtime.storageRoot, storage, plan, Readable.from(bytes));
  const snapshot = {
    ...connection.db.transaction(createProcessingSnapshot),
    ...changes,
  };
  const result = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: '伪装文件.JPG',
      visibility: 'public',
      format: 'JPEG',
      mime: 'image/jpeg',
      byteSize: bytes.length,
      snapshot,
      expectedVersions: snapshot.compressionEnabled
        ? ['compressed', 'thumbnail']
        : ['thumbnail'],
    }),
  );
  return { ...result, storage, key: plan.key, bytes };
}
async function processNext() {
  const job = claimNextMediaJob(connection.db)!;
  expect(job).not.toBeNull();
  await processMediaJob(runtime, job.id);
}
const state = (id: string) => getImageAccessState(connection.db, id)!;
async function versionBytes(
  imageId: string,
  kind: 'original' | 'compressed' | 'thumbnail',
) {
  const row = state(imageId).versions.find((v) => v.kind === kind)!.saved!;
  const object = await readObject(
    runtime.storageRoot,
    resolveUploadStorage(connection.db, row.object.storageId),
    row.object.key,
    row.version.mime,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function image(args: string[], extension = 'png') {
  const file = join(directory, `${randomUUID()}.${extension}`);
  await execa('magick', [...args, file]);
  return file;
}

// This project requires actual ImageMagick 7 + ExifTool; missing tools fail, never skip.
describe('T-MED-03 real JPEG/PNG processing', () => {
  it.each([false, true])(
    'propagates injected tool-cleanup failure after real processing and preserves its workspace (shutdown=%s)',
    async (shutdown) => {
      const accepted = await accept(
        await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
      );
      const job = claimNextMediaJob(connection.db)!;
      const controller = new AbortController();
      const failure = Object.assign(
        new Error('Injected process-group confirmation failure'),
        {
          code: 'MEDIA_TOOL_SHUTDOWN_FAILED',
        },
      );
      const actualStart = mediaTools.startMediaTool;
      // This injects a cleanup diagnostic only after the real codec has exited.
      // It verifies error propagation, not evidence of a live orphan process.
      const injectedStart: typeof mediaTools.startMediaTool = (
        command,
        args,
        options,
      ) => {
        const actual = actualStart(command, args, options);
        if (command !== 'magick') return actual;
        return {
          ...actual,
          settled: actual.settled.then((error) => {
            if (error) throw error;
            if (shutdown)
              controller.abort(
                Object.assign(new Error('Web runtime is stopping'), {
                  code: 'MEDIA_INTERRUPTED',
                }),
              );
            return failure;
          }),
        };
      };
      const spy = vi
        .spyOn(mediaTools, 'startMediaTool')
        .mockImplementation(injectedStart);
      try {
        await expect(
          processMediaJob(runtime, job.id, controller.signal),
        ).rejects.toBe(failure);
        expect(state(accepted.imageId).latestJob).toMatchObject({
          status: 'failed',
          retryCount: 0,
          error: expect.stringContaining('MEDIA_TOOL_SHUTDOWN_FAILED'),
        });
        expect(state(accepted.imageId).latestJob!.error).not.toContain(
          'MEDIA_INTERRUPTED',
        );
        expect(
          (
            await stat(join(runtime.temporaryRoot, `media-${job.id}`))
          ).isDirectory(),
        ).toBe(true);
        expect(
          state(accepted.imageId)
            .versions.filter((version) => version.saved)
            .map((version) => version.kind),
        ).toEqual(['original']);
        expect(await versionBytes(accepted.imageId, 'original')).toEqual(
          accepted.bytes,
        );
      } finally {
        spy.mockRestore();
      }
    },
  );

  it.each(['jpg', 'png'])(
    'preserves original %s bytes, fixes supplied type and saves both actual WebP versions',
    async (extension) => {
      const bytes = await readFile(
        resolve(`tests/fixtures/runtime/images/sample.${extension}`),
      );
      const accepted = await accept(bytes);
      await processNext();
      expect(state(accepted.imageId).image).toMatchObject({
        processingStatus: 'ready',
        format: extension === 'jpg' ? 'JPEG' : 'PNG',
        width: 64,
        height: 48,
        animated: false,
        pageCount: 1,
      });
      expect(state(accepted.imageId).latestJob).toMatchObject({
        status: 'succeeded',
        error: null,
        startedAt: expect.any(Date),
        finishedAt: expect.any(Date),
      });
      expect(await versionBytes(accepted.imageId, 'original')).toEqual(bytes);
      for (const kind of ['compressed', 'thumbnail'] as const) {
        const output = await versionBytes(accepted.imageId, kind);
        const facts = JSON.parse(
          (
            await execa(
              'exiftool',
              [
                '-json',
                '-n',
                '-FileType',
                '-MIMEType',
                '-ImageWidth',
                '-ImageHeight',
                '-',
              ],
              { input: output },
            )
          ).stdout,
        )[0];
        expect(facts).toMatchObject({
          FileType: 'WEBP',
          MIMEType: 'image/webp',
          ImageWidth: 64,
          ImageHeight: 48,
        });
        expect(
          state(accepted.imageId).versions.find((v) => v.kind === kind)!.saved!
            .version.byteSize,
        ).toBe(output.length);
        // Exact comparison also proves 82/80 and the no-upscale operator use the saved settings.
        const expected = await execa(
          'magick',
          [
            `${extension === 'jpg' ? 'jpeg' : 'png'}:-`,
            '-auto-orient',
            '-colorspace',
            'sRGB',
            ...(kind === 'thumbnail' ? ['-resize', '640x640>'] : []),
            '-strip',
            '-quality',
            kind === 'thumbnail' ? '80' : '82',
            'webp:-',
          ],
          { input: bytes, encoding: 'buffer' },
        );
        expect(output).toEqual(Buffer.from(expected.stdout));
      }
    },
  );

  it.each([
    ['jpg', 6],
    ['png', 6],
    ['jpg', 2],
  ] as const)(
    'applies %s orientation %i before resizing and strips metadata',
    async (extension, orientation) => {
      const path = await image(
        [
          '-size',
          '1200x800',
          'xc:red',
          '-fill',
          'blue',
          '-draw',
          'rectangle 600,0 1199,799',
        ],
        extension,
      );
      await execa('exiftool', [
        '-overwrite_original',
        `-Orientation#=${orientation}`,
        '-Artist=private-author',
        '-XMP:Label=private-label',
        path,
      ]);
      const original = await readFile(path);
      const accepted = await accept(original);
      await processNext();
      expect(state(accepted.imageId).image.processingStatus).toBe('ready');
      const result = state(accepted.imageId).versions.find(
        (v) => v.kind === 'thumbnail',
      )!.saved!.version;
      expect([result.width, result.height]).toEqual(
        orientation === 6 ? [427, 640] : [640, 427],
      );
      const thumbnail = await versionBytes(accepted.imageId, 'thumbnail');
      const metadata = JSON.parse(
        (
          await execa(
            'exiftool',
            [
              '-json',
              '-EXIF:all',
              '-XMP:all',
              '-IPTC:all',
              '-ICC_Profile:all',
              '-',
            ],
            { input: thumbnail },
          )
        ).stdout,
      )[0];
      expect(Object.keys(metadata)).toEqual(['SourceFile']);
      const pixels = await execa(
        'magick',
        ['webp:-', '-crop', '1x1+100+100', '+repage', '-depth', '8', 'rgb:-'],
        { input: thumbnail, encoding: 'buffer' },
      );
      const [red, , blue] = pixels.stdout;
      expect(orientation === 6 ? red : blue).toBeGreaterThan(230);
      expect(orientation === 6 ? blue : red).toBeLessThan(20);
      expect(await versionBytes(accepted.imageId, 'original')).toEqual(
        original,
      );
    },
  );

  it('retains alpha, uses the queued quality/maxEdge snapshot, and does not use later settings', async () => {
    const path = await image([
      '-size',
      '800x400',
      'xc:none',
      '-fill',
      'red',
      '-draw',
      'rectangle 0,0 399,399',
    ]);
    const accepted = await accept(await readFile(path), {
      quality: 61,
      maxEdge: 200,
    });
    connection.db.transaction((tx) =>
      updateMediaSettings(tx, {
        ...initialMediaSettings,
        compressionEnabled: false,
        defaultLinkVersion: 'original',
        quality: 10,
      }),
    );
    const job = claimNextMediaJob(connection.db)!;
    const pending = processMediaJob(runtime, job.id);
    const other = openRuntimeDatabase(join(directory, 'ariso.db'));
    try {
      other.db
        .update(mediaImages)
        .set({ displayName: 'during actual I/O' })
        .where(eq(mediaImages.id, accepted.imageId))
        .run();
    } finally {
      other.close();
    }
    expect(state(accepted.imageId).image.processingStatus).toBe('processing');
    await pending;
    const result = state(accepted.imageId);
    expect(result.image).toMatchObject({
      processingStatus: 'ready',
      displayName: 'during actual I/O',
    });
    expect(result.latestJob!.snapshot).toMatchObject({
      quality: 61,
      maxEdge: 200,
      compressionEnabled: true,
    });
    expect(
      result.versions.find((v) => v.kind === 'compressed')!.saved!.version,
    ).toMatchObject({ width: 200, height: 100 });
    expect(
      result.versions.find((v) => v.kind === 'thumbnail')!.saved!.version,
    ).toMatchObject({ width: 640, height: 320 });
    const output = await versionBytes(accepted.imageId, 'compressed');
    const pixel = await execa(
      'magick',
      ['webp:-', '-crop', '1x1+150+50', '+repage', '-depth', '8', 'rgba:-'],
      { input: output, encoding: 'buffer' },
    );
    expect(pixel.stdout[3]).toBe(0);
    const expected = await execa(
      'magick',
      [
        path,
        '-auto-orient',
        '-colorspace',
        'sRGB',
        '-resize',
        '200x200>',
        '-strip',
        '-quality',
        '61',
        'webp:-',
      ],
      { encoding: 'buffer' },
    );
    expect(output).toEqual(Buffer.from(expected.stdout));
  });

  it('compression off creates only a thumbnail', async () => {
    const accepted = await accept(
      await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
      { compressionEnabled: false },
    );
    await processNext();
    expect(state(accepted.imageId).image.processingStatus).toBe('ready');
    expect(
      state(accepted.imageId)
        .versions.filter((v) => v.saved)
        .map((v) => v.kind),
    ).toEqual(['original', 'thumbnail']);
  });

  it('thumbnail publication failure retains the original and published compressed version, and records candidate responsibility', async () => {
    const accepted = await accept(
      await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
    );
    connection.db.$client.exec(
      "CREATE TRIGGER fail_thumbnail BEFORE INSERT ON media_versions WHEN NEW.kind = 'thumbnail' BEGIN SELECT RAISE(ABORT, 'controlled thumbnail publication failure'); END",
    );
    await processNext();
    const result = state(accepted.imageId);
    expect(result.image.processingStatus).toBe('failed');
    expect(result.latestJob).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('thumbnail: MEDIA_PROCESS_FAILED'),
    });
    expect(result.latestJob!.error).toContain(
      'controlled thumbnail publication failure',
    );
    expect(result.versions.filter((v) => v.saved).map((v) => v.kind)).toEqual([
      'original',
      'compressed',
    ]);
    expect(await versionBytes(accepted.imageId, 'original')).toEqual(
      accepted.bytes,
    );
    const compressed = await versionBytes(accepted.imageId, 'compressed');
    expect(compressed.subarray(0, 4).toString()).toBe('RIFF');
    const candidates = connection.db
      .select()
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.jobId, accepted.jobId),
          eq(mediaObjects.status, 'cleanup_pending'),
        ),
      )
      .all();
    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.purpose === 'thumbnail')!.error).toContain(
      'publication failure',
    );
    expect(
      connection.db
        .select()
        .from(mediaObjects)
        .where(
          eq(
            mediaObjects.id,
            result.versions.find((v) => v.kind === 'compressed')!.saved!.object
              .id,
          ),
        )
        .get()!.status,
    ).toBe('stored');
  });

  it('rolls back failed job and image settlement when candidate cleanup registration fails, then recovers after reopening', async () => {
    const accepted = await accept(
      await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
    );
    connection.db.$client.exec(`
      CREATE TRIGGER fail_thumbnail BEFORE INSERT ON media_versions
      WHEN NEW.kind = 'thumbnail'
      BEGIN SELECT RAISE(ABORT, 'controlled thumbnail publication failure'); END;
      CREATE TRIGGER fail_cleanup BEFORE UPDATE OF status ON media_objects
      WHEN NEW.status = 'cleanup_pending'
      BEGIN SELECT RAISE(ABORT, 'controlled candidate cleanup registration failure'); END;
    `);
    await expect(processNext()).rejects.toThrow(
      'controlled candidate cleanup registration failure',
    );
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    runtime.db = connection.db;
    const interrupted = state(accepted.imageId);
    expect(interrupted.latestJob).toMatchObject({
      status: 'running',
      finishedAt: null,
      retryCount: 0,
    });
    expect(interrupted.image.processingStatus).toBe('processing');
    const compressedId = interrupted.versions.find(
      (version) => version.kind === 'compressed',
    )!.saved!.object.id;
    const unfinished = connection.db
      .select()
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.jobId, accepted.jobId),
          eq(mediaObjects.status, 'writing'),
        ),
      )
      .all();
    expect(unfinished.map((object) => object.purpose).sort()).toEqual([
      'temporary',
      'thumbnail',
    ]);
    connection.db.$client.exec('DROP TRIGGER fail_thumbnail');
    connection.db.$client.exec('DROP TRIGGER fail_cleanup');
    recoverMediaJobs(connection.db);
    await processNext();
    const recovered = state(accepted.imageId);
    expect(recovered.latestJob).toMatchObject({
      status: 'succeeded',
      retryCount: 0,
      error: null,
    });
    expect(recovered.image.processingStatus).toBe('ready');
    expect(
      recovered.versions.find((version) => version.kind === 'compressed')!
        .saved!.object.id,
    ).toBe(compressedId);
    expect(
      recovered.versions.find((version) => version.kind === 'thumbnail')!.saved!
        .object.id,
    ).toBe(unfinished.find((object) => object.purpose === 'thumbnail')!.id);
    expect(await versionBytes(accepted.imageId, 'original')).toEqual(
      accepted.bytes,
    );
  });

  it('does not start the next step after storage is disabled', async () => {
    const accepted = await accept(
      await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
    );
    connection.db.$client.exec(
      "CREATE TRIGGER disable_after_compressed AFTER INSERT ON media_versions WHEN NEW.kind = 'compressed' BEGIN UPDATE storage_configs SET enabled=0; END",
    );
    await processNext();
    expect(state(accepted.imageId).latestJob!.error).toContain(
      'STORAGE_DISABLED',
    );
    expect(
      state(accepted.imageId)
        .versions.filter((v) => v.saved)
        .map((v) => v.kind),
    ).toEqual(['original', 'compressed']);
    expect(
      connection.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.purpose, 'thumbnail'))
        .all(),
    ).toEqual([]);
  });

  it.each(['disabled', 'deleting', 'cancelled'] as const)(
    'rechecks %s after asynchronous I/O and before publishing',
    async (condition) => {
      const accepted = await accept(
        await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
      );
      const job = claimNextMediaJob(connection.db)!;
      const pending = processMediaJob(runtime, job.id);
      await vi.waitFor(
        () =>
          expect(
            connection.db
              .select()
              .from(mediaObjects)
              .where(
                and(
                  eq(mediaObjects.jobId, job.id),
                  eq(mediaObjects.status, 'writing'),
                ),
              )
              .all().length,
          ).toBeGreaterThan(0),
        { interval: 1, timeout: 5000 },
      );
      if (condition === 'disabled')
        connection.db.update(storageConfigs).set({ enabled: false }).run();
      if (condition === 'deleting')
        connection.db
          .update(mediaImages)
          .set({ deletionStatus: 'deleting' })
          .run();
      if (condition === 'cancelled')
        connection.db.update(mediaJobs).set({ status: 'cancelled' }).run();
      await pending;
      expect(state(accepted.imageId).image.processingStatus).not.toBe('ready');
      expect(
        state(accepted.imageId)
          .versions.filter((v) => v.saved)
          .map((v) => v.kind),
      ).toEqual(['original']);
      expect(state(accepted.imageId).latestJob!.status).toBe(
        condition === 'cancelled' ? 'cancelled' : 'failed',
      );
    },
  );

  it.each([{ outputFormat: 'jpeg' }, { watermarkMode: 'text' }] as const)(
    'reports unsupported settings rather than silently creating another version: %j',
    async (changes) => {
      const accepted = await accept(
        await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
        changes,
      );
      await processNext();
      expect(state(accepted.imageId).latestJob!.error).toContain(
        'MEDIA_SETTINGS_UNSUPPORTED',
      );
      expect(
        state(accepted.imageId).versions.filter((v) => v.saved),
      ).toHaveLength(1);
      expect(await versionBytes(accepted.imageId, 'original')).toEqual(
        accepted.bytes,
      );
    },
  );

  it('failed full decode retains the accepted truncated original and no incomplete version is published', async () => {
    const source = await readFile(
      resolve('tests/fixtures/runtime/images/sample.png'),
    );
    const accepted = await accept(source.subarray(0, 42));
    await processNext();
    expect(state(accepted.imageId).image.processingStatus).toBe('failed');
    expect(state(accepted.imageId).latestJob!.error).toBeTruthy();
    expect(
      state(accepted.imageId).versions.filter((v) => v.saved),
    ).toHaveLength(1);
    expect(await versionBytes(accepted.imageId, 'original')).toEqual(
      source.subarray(0, 42),
    );
  });

  it('actual storage write failure is bounded, retains bytes, and records the failed step', async () => {
    const accepted = await accept(
      await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
    );
    const parent = join(
      runtime.storageRoot,
      accepted.storage.localPath,
      'ariso',
      accepted.storage.id,
      'images',
      accepted.imageId,
    );
    await mkdir(parent, { recursive: true });
    await writeFile(join(parent, 'compressed'), 'path is occupied');
    const start = Date.now();
    await processNext();
    expect(Date.now() - start).toBeLessThan(5000);
    expect(state(accepted.imageId).latestJob!.error).toContain(
      'compressed: STORAGE_OPERATION_FAILED',
    );
    expect(state(accepted.imageId).latestJob!.error).toContain('compressed');
    expect(
      state(accepted.imageId).versions.filter((v) => v.saved),
    ).toHaveLength(1);
    expect(await versionBytes(accepted.imageId, 'original')).toEqual(
      accepted.bytes,
    );
  });

  it('does not impose a fixed input dimension limit on a real 32769-pixel PNG', async () => {
    const source = await image(['-size', '32769x1', 'xc:red']);
    const accepted = await accept(await readFile(source), {
      compressionEnabled: false,
    });
    await processNext();
    expect(state(accepted.imageId).image).toMatchObject({
      width: 32769,
      height: 1,
      processingStatus: 'ready',
    });
    expect(
      state(accepted.imageId).versions.find((v) => v.kind === 'thumbnail')!
        .saved!.version,
    ).toMatchObject({ width: 640, height: 1 });
  });

  it('persists cancellation during real asynchronous processing without publishing a partial output', async () => {
    const accepted = await accept(
      await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
    );
    const job = claimNextMediaJob(connection.db)!;
    const controller = new AbortController();
    const pending = processMediaJob(runtime, job.id, controller.signal);
    controller.abort();
    await pending;
    expect(state(accepted.imageId).latestJob).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('MEDIA_CANCELLED'),
    });
    expect(state(accepted.imageId).image.processingStatus).toBe('failed');
    expect(
      state(accepted.imageId).versions.filter((v) => v.saved),
    ).toHaveLength(1);
    expect(await versionBytes(accepted.imageId, 'original')).toEqual(
      accepted.bytes,
    );
  });
  it('the 600-second content deadline fails durably without spending an automatic retry', async () => {
    const accepted = await accept(
      await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
    );
    const job = claimNextMediaJob(connection.db)!;
    vi.useFakeTimers();
    const pending = processMediaJob(runtime, job.id);
    vi.advanceTimersByTime(600_000);
    vi.useRealTimers();
    await pending;
    expect(state(accepted.imageId).latestJob).toMatchObject({
      status: 'failed',
      retryCount: 0,
      error: expect.stringContaining('MEDIA_JOB_TIMEOUT'),
    });
    expect(await versionBytes(accepted.imageId, 'original')).toEqual(
      accepted.bytes,
    );
  });
});
