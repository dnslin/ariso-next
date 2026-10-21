import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import {
  requestImageSize,
  readImageSize,
} from '../../../src/server/media/sizes.ts';
import { mediaSizeVersions } from '../../../src/server/media/size-schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import * as local from '../../../src/server/storage/local.ts';
import { inspectImage } from '../../../src/server/media/formats.ts';
import * as processing from '../../../src/server/media/processing.ts';
import * as mediaTools from '../../../src/server/media/tools.ts';
import { renderSizeCandidate } from '../../../src/server/media/size-render.ts';
import { processImageSizeJob } from '../../../src/server/media/size-process.ts';
import {
  claimNextMediaJob,
  startMediaQueue,
} from '../../../src/server/media/queue.ts';
import { mediaError } from '../../../src/server/media/errors.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

it('queues one owner-requested preset, publishes actual dimensions without enlargement, and reuses the saved result', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  expect(
    readImageSize(app.db, image.imageId, {
      version: 'compressed',
      preset: 'medium',
    }).status,
  ).toBe('missing');
  const receipt = requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'medium',
  });
  expect(receipt.status).toBe('queued');
  expect(
    requestImageSize(app.db, image.imageId, {
      version: 'compressed',
      preset: 'medium',
    }).jobId,
  ).toBe(receipt.jobId);
  expect((await app.processNext()).status).toBe('succeeded');
  const result = readImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'medium',
  });
  expect(result.status).toBe('ready');
  const base = app
    .state(image.imageId)
    .versions.find((item) => item.kind === 'compressed')!.saved!.version;
  expect(result.width).toBe(base.width);
  expect(result.height).toBe(base.height);
  const delivered = await app.request(
    image.imageId,
    '?type=compressed&preset=medium',
  );
  const actual = await inspectImage(
    Readable.from(Buffer.from(await delivered.arrayBuffer())),
    app.runtime.temporaryRoot,
  );
  expect(actual.width).toBe(result.width);
  expect(actual.height).toBe(result.height);
  expect(
    requestImageSize(app.db, image.imageId, {
      version: 'compressed',
      preset: 'medium',
    }).status,
  ).toBe('ready');
  expect(
    (
      await app.request(image.imageId, '?type=compressed&preset=medium', {
        method: 'HEAD',
      })
    ).status,
  ).toBe(200);
});

it('does not publish for a recycled image and never serves a missing preset as the base version', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  const receipt = requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'small',
  });
  expect(
    (await app.request(image.imageId, '?type=compressed&preset=small')).status,
  ).toBe(404);
  app.db
    .update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, image.imageId))
    .run();
  expect((await app.processNext()).status).toBe('failed');
  expect(
    app.db
      .select()
      .from(mediaSizeVersions)
      .where(
        and(
          eq(mediaSizeVersions.imageId, image.imageId),
          eq(mediaSizeVersions.preset, 'small'),
        ),
      )
      .all(),
  ).toEqual([]);
  expect(
    app.db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, receipt.jobId!))
      .get()?.error,
  ).toBeTruthy();
});

it('preserves the actual storage failure when encoding output has not yet been consumed', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  const before = app
    .state(image.imageId)
    .versions.find((item) => item.kind === 'compressed')!.saved!.object.id;
  const receipt = requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'small',
  });
  const info = vi.spyOn(app.runtime.logger, 'info');
  const error = vi.spyOn(app.runtime.logger, 'error');
  vi.spyOn(local, 'writeObject').mockRejectedValue(
    Object.assign(new Error('size storage rejected before consumption'), {
      code: 'EACCES',
    }),
  );
  expect((await app.processNext()).status).toBe('failed');
  expect(app.job(receipt.jobId!).error).toContain(
    'size storage rejected before consumption',
  );
  expect(info).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: receipt.jobId }),
    'Size processing failed',
  );
  expect(
    app
      .state(image.imageId)
      .versions.find((item) => item.kind === 'compressed')!.saved!.object.id,
  ).toBe(before);
  expect(
    app.db
      .select()
      .from(mediaSizeVersions)
      .where(eq(mediaSizeVersions.imageId, image.imageId))
      .all(),
  ).toEqual([]);
});

it('rejects publication when the current source changes during a size write', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  const saved = app
    .state(image.imageId)
    .versions.find((item) => item.kind === 'compressed')!.saved!;
  const bytes = Buffer.from(
    await (await app.request(image.imageId, '?type=compressed')).arrayBuffer(),
  );
  const storage = app.db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, saved.object.storageId))
    .get()!;
  const receipt = requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'small',
  });
  const write = local.writeObject;
  vi.spyOn(local, 'writeObject').mockImplementation(async (...args) => {
    const result = await write(...args);
    const later = local.planLocalWrite('later-source');
    await write(
      app.runtime.storageRoot,
      { id: storage.id, localPath: storage.localPath!, enabled: true },
      later,
      Readable.from(bytes),
    );
    const id = randomUUID();
    app.db.transaction((tx) => {
      tx.insert(mediaObjects)
        .values({ ...saved.object, id, key: later.key })
        .run();
      tx.update(mediaVersions)
        .set({ objectId: id })
        .where(
          and(
            eq(mediaVersions.imageId, image.imageId),
            eq(mediaVersions.kind, 'compressed'),
          ),
        )
        .run();
    });
    return result;
  });
  expect((await app.processNext()).status).toBe('failed');
  expect(app.job(receipt.jobId!).error).toContain('源版本已变化');
  expect(
    app.db
      .select()
      .from(mediaSizeVersions)
      .where(eq(mediaSizeVersions.imageId, image.imageId))
      .all(),
  ).toEqual([]);
});

it('does not let a private preset bypass owner access or a disabled storage', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'small',
  });
  expect((await app.processNext()).status).toBe('succeeded');
  app.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, image.imageId))
    .run();
  expect(
    (await app.request(image.imageId, '?type=compressed&preset=small')).status,
  ).toBe(401);
  app.db.update(storageConfigs).set({ enabled: false }).run();
  expect(() =>
    requestImageSize(app.db, image.imageId, {
      version: 'compressed',
      preset: 'small',
    }),
  ).toThrow(expect.objectContaining({ code: 'STORAGE_DISABLED' }));
});

it('keeps size tools under the owning workspace and preserves base-processing files', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  const input = { version: 'compressed', preset: 'small' } as const;
  const receipt = requestImageSize(app.db, image.imageId, input);
  expect(claimNextMediaJob(app.db)?.id).toBe(receipt.jobId);
  const source = app
    .state(image.imageId)
    .versions.find((item) => item.kind === input.version)!.saved!.object;
  const workspace = join(app.runtime.temporaryRoot, `media-${receipt.jobId}`);
  await mkdir(workspace);
  await writeFile(join(workspace, 'preview.png'), 'base-processing input');
  const start = processing.startDerivedEncoding;
  const encoding = vi
    .spyOn(processing, 'startDerivedEncoding')
    .mockImplementation(async (options) => {
      expect(options.workspace).toBe(workspace);
      expect(await readFile(join(workspace, 'preview.png'), 'utf8')).toBe(
        'base-processing input',
      );
      return start(options);
    });
  await renderSizeCandidate(
    app.runtime,
    receipt.jobId!,
    input,
    source,
    new AbortController().signal,
  );
  expect(encoding).toHaveBeenCalledOnce();
  expect(await readFile(join(workspace, 'preview.png'), 'utf8')).toBe(
    'base-processing input',
  );
  expect(await readdir(workspace)).not.toContain('size-compressed-small');
  expect(
    (await readdir(app.runtime.temporaryRoot)).filter((name) =>
      name.includes(receipt.jobId!),
    ),
  ).toEqual([`media-${receipt.jobId}`]);
});

it.each(['resume', 'restart'] as const)(
  'reuses a stored size candidate after %s and removes its interrupted task scratch',
  async (mode) => {
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    const input = { version: 'compressed', preset: 'small' } as const;
    const receipt = requestImageSize(app.db, image.imageId, input);
    expect(claimNextMediaJob(app.db)?.id).toBe(receipt.jobId);
    const source = app
      .state(image.imageId)
      .versions.find((item) => item.kind === input.version)!.saved!.object;
    await renderSizeCandidate(
      app.runtime,
      receipt.jobId!,
      input,
      source,
      new AbortController().signal,
    );
    const objects = app.db.select().from(mediaObjects).all();
    const workspace = join(app.runtime.temporaryRoot, `media-${receipt.jobId}`);
    const inputDirectory = join(workspace, 'size-compressed-small');
    await mkdir(inputDirectory, { recursive: true });
    await writeFile(join(inputDirectory, 'source'), 'interrupted download');
    const encoding = vi
      .spyOn(processing, 'startDerivedEncoding')
      .mockRejectedValue(new Error('A stored size must not be encoded again'));
    let queue: ReturnType<typeof startMediaQueue> | undefined;
    try {
      if (mode === 'restart') {
        queue = startMediaQueue(app.runtime);
        await expect
          .poll(() => app.job(receipt.jobId!).status)
          .toBe('succeeded');
        expect(app.job(receipt.jobId!).recoveryCount).toBe(1);
      } else await processImageSizeJob(app.runtime, receipt.jobId!);
      expect(app.job(receipt.jobId!).status).toBe('succeeded');
    } finally {
      await queue?.stop();
    }
    expect(readImageSize(app.db, image.imageId, input).status).toBe('ready');
    expect(encoding).not.toHaveBeenCalled();
    expect(app.db.select().from(mediaObjects).all()).toEqual(objects);
    expect(existsSync(workspace)).toBe(false);
  },
);

it('removes terminal size scratch during startup while preserving unknown owners', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  const receipt = requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'small',
  });
  app.db
    .update(mediaJobs)
    .set({ status: 'failed', error: 'size: interrupted terminal cleanup' })
    .where(eq(mediaJobs.id, receipt.jobId!))
    .run();
  const workspace = join(app.runtime.temporaryRoot, `media-${receipt.jobId}`);
  const inputDirectory = join(workspace, 'size-compressed-small');
  const unknown = join(app.runtime.temporaryRoot, `media-${randomUUID()}`);
  await mkdir(inputDirectory, { recursive: true });
  await mkdir(unknown);
  await writeFile(join(inputDirectory, 'source'), 'owned input');
  await writeFile(join(workspace, 'native-cache'), 'owned cache');
  await writeFile(join(unknown, 'keep'), 'another owner');
  const queue = startMediaQueue(app.runtime);
  try {
    await expect.poll(() => existsSync(workspace)).toBe(false);
    expect(app.job(receipt.jobId!)).toMatchObject({
      status: 'failed',
      error: 'size: interrupted terminal cleanup',
    });
    expect(await readFile(join(unknown, 'keep'), 'utf8')).toBe('another owner');
    expect(
      Buffer.from(
        await (
          await app.request(image.imageId, '?type=original')
        ).arrayBuffer(),
      ),
    ).toEqual(image.bytes);
  } finally {
    await queue.stop();
  }
});

it('logs normal size interruption as informational and leaves the job resumable', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  const receipt = requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'small',
  });
  expect(claimNextMediaJob(app.db)?.id).toBe(receipt.jobId);
  const info = vi.spyOn(app.runtime.logger, 'info');
  const error = vi.spyOn(app.runtime.logger, 'error');
  const controller = new AbortController();
  controller.abort(mediaError('MEDIA_INTERRUPTED', 'Web runtime is stopping'));
  await processImageSizeJob(app.runtime, receipt.jobId!, controller.signal);
  expect(app.job(receipt.jobId!)).toMatchObject({ status: 'running' });
  expect(app.job(receipt.jobId!).error).toContain('Web runtime is stopping');
  expect(info).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: receipt.jobId }),
    'Size processing interrupted',
  );
  expect(error).not.toHaveBeenCalled();
  expect(
    (await readdir(app.runtime.temporaryRoot)).filter((name) =>
      name.includes(receipt.jobId!),
    ),
  ).toEqual([]);
});

it('preserves a tool shutdown failure during interruption as an error and retains its owned scratch', async () => {
  const image = await app.accept('tests/fixtures/runtime/images/sample.png');
  const receipt = requestImageSize(app.db, image.imageId, {
    version: 'compressed',
    preset: 'small',
  });
  expect(claimNextMediaJob(app.db)?.id).toBe(receipt.jobId);
  const workspace = join(app.runtime.temporaryRoot, `media-${receipt.jobId}`);
  await mkdir(workspace);
  await writeFile(join(workspace, 'native-cache'), 'unsettled tool cache');
  const failure = mediaError(
    'MEDIA_TOOL_SHUTDOWN_FAILED',
    'Cannot stop the size tool process group',
  );
  vi.spyOn(mediaTools, 'terminateMediaTools').mockRejectedValue(failure);
  const info = vi.spyOn(app.runtime.logger, 'info');
  const error = vi.spyOn(app.runtime.logger, 'error');
  const controller = new AbortController();
  controller.abort(mediaError('MEDIA_INTERRUPTED', 'Web runtime is stopping'));
  await expect(
    processImageSizeJob(app.runtime, receipt.jobId!, controller.signal),
  ).rejects.toBe(failure);
  expect(app.job(receipt.jobId!).status).toBe('failed');
  expect(app.job(receipt.jobId!).error).toContain(
    'MEDIA_TOOL_SHUTDOWN_FAILED: Cannot stop the size tool process group',
  );
  expect(info).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(
    { err: failure, jobId: receipt.jobId },
    'Size processing failed',
  );
  expect(await readFile(join(workspace, 'native-cache'), 'utf8')).toBe(
    'unsettled tool cache',
  );
});
