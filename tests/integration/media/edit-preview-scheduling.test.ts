import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { startMediaQueue } from '../../../src/server/media/queue.ts';
import {
  mediaImages,
  mediaJobs,
  mediaPreviews,
} from '../../../src/server/media/schema.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import { mediaError } from '../../../src/server/media/errors.ts';
import * as processing from '../../../src/server/media/process.ts';
import * as previewProcessing from '../../../src/server/media/preview-process.ts';
import * as fingerprinting from '../../../src/server/media/fingerprint-job.ts';
import { enqueueFingerprintJobs } from '../../../src/server/media/fingerprints.ts';

let app: ReturnType<typeof collectionFixture>;
let queue: ReturnType<typeof startMediaQueue> | undefined;
const logger = { info: vi.fn(), error: vi.fn() };
beforeEach(() => {
  app = collectionFixture();
  logger.info.mockClear();
  logger.error.mockClear();
});
afterEach(async () => {
  try {
    await queue?.stop();
  } finally {
    queue = undefined;
    vi.restoreAllMocks();
    app.close();
  }
});
function start() {
  const temporaryRoot = join(app.storageRoot, '..', 'tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  queue = startMediaQueue({
    db: app.db,
    storageRoot: app.storageRoot,
    temporaryRoot,
    logger,
  });
  return queue;
}
function enqueue() {
  return app.db.transaction((tx) =>
    acceptOriginal(tx, {
      ...app.input(),
    }),
  );
}
function finish(jobId: string) {
  const job = app.db
    .select()
    .from(mediaJobs)
    .where(eq(mediaJobs.id, jobId))
    .get()!;
  app.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.id, jobId))
    .run();
  app.db
    .update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, job.imageId))
    .run();
}
const status = (jobId: string) =>
  app.db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get()!.status;

describe('transient editor previews in the media scheduler', () => {
  it('runs an interactive preview before an older background fingerprint job', async () => {
    const accepted = enqueue();
    finish(accepted.jobId);
    expect(enqueueFingerprintJobs(app.db)).toBe(1);
    app.db
      .update(mediaJobs)
      .set({ createdAt: new Date(1) })
      .where(eq(mediaJobs.kind, 'fingerprint'))
      .run();
    const release = Promise.withResolvers<void>();
    const started: string[] = [];
    vi.spyOn(fingerprinting, 'processFingerprintJob').mockImplementation(
      async (_runtime, jobId) => {
        started.push('fingerprint');
        await release.promise;
        finish(jobId);
      },
    );
    const service = start();
    const preview = service.runTransientPreview(async () => {
      started.push('preview');
      return 'interactive';
    }, new AbortController().signal);
    try {
      await vi.waitFor(() => expect(started[0]).toBe('preview'));
      await expect(preview).resolves.toBe('interactive');
      await vi.waitFor(() =>
        expect(started).toEqual(['preview', 'fingerprint']),
      );
    } finally {
      release.resolve();
      await preview;
    }
  });

  it('shares one configured slot with persistent work and returns each callback result in order', async () => {
    const releasePersistent = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const releaseSecond = Promise.withResolvers<void>();
    const started: string[] = [];
    let active = 0;
    let maximum = 0;
    async function hold(name: string, gate: Promise<void>) {
      started.push(name);
      active++;
      maximum = Math.max(maximum, active);
      try {
        await gate;
      } finally {
        active--;
      }
      return name;
    }
    vi.spyOn(processing, 'processMediaJob').mockImplementation(
      async (_runtime, jobId) => {
        await hold('persistent', releasePersistent.promise);
        finish(jobId);
      },
    );
    enqueue();
    const service = start();
    try {
      await vi.waitFor(() => expect(started).toEqual(['persistent']));
      const first = service.runTransientPreview(
        () => hold('first', releaseFirst.promise),
        new AbortController().signal,
      );
      const second = service.runTransientPreview(
        () => hold('second', releaseSecond.promise),
        new AbortController().signal,
      );
      await delay(100);
      expect(started).toEqual(['persistent']);
      expect(service.activeWrites(app.storage.id)).toBe(1);
      releasePersistent.resolve();
      await vi.waitFor(() => expect(started).toEqual(['persistent', 'first']));
      expect(service.activeWrites(app.storage.id)).toBe(0);
      releaseFirst.resolve();
      await expect(first).resolves.toBe('first');
      await vi.waitFor(() =>
        expect(started).toEqual(['persistent', 'first', 'second']),
      );
      releaseSecond.resolve();
      await expect(second).resolves.toBe('second');
      expect(maximum).toBe(1);
    } finally {
      releasePersistent.resolve();
      releaseFirst.resolve();
      releaseSecond.resolve();
    }
  });

  it('removes a cancelled waiting preview without invoking its callback', async () => {
    const release = Promise.withResolvers<void>();
    vi.spyOn(processing, 'processMediaJob').mockImplementation(
      async (_runtime, jobId) => {
        await release.promise;
        finish(jobId);
      },
    );
    const persistent = enqueue();
    const service = start();
    const controller = new AbortController();
    const operation = vi.fn(async () => 'must not run');
    const cancelled = new Error('cancel waiting preview');
    try {
      await vi.waitFor(() => expect(status(persistent.jobId)).toBe('running'));
      const waiting = service.runTransientPreview(operation, controller.signal);
      const rejected = expect(waiting).rejects.toBe(cancelled);
      controller.abort(cancelled);
      await rejected;
      await expect(
        service.runTransientPreview(operation, AbortSignal.abort(cancelled)),
      ).rejects.toBe(cancelled);
      release.resolve();
      await service.runTransientPreview(
        async () => 'after cancelled',
        new AbortController().signal,
      );
      expect(operation).not.toHaveBeenCalled();
    } finally {
      release.resolve();
    }
  });

  it('continues after a normal preview failure and keeps the persistent backup idle boundary independent', async () => {
    const release = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    vi.spyOn(processing, 'processMediaJob').mockImplementation(
      async (_runtime, jobId) => finish(jobId),
    );
    const service = start();
    service.pause();
    const persistent = enqueue();
    try {
      const preview = service.runTransientPreview(async () => {
        entered.resolve();
        await release.promise;
        return 'preview';
      }, new AbortController().signal);
      await entered.promise;
      await expect(
        service.waitForIdle(AbortSignal.timeout(200)),
      ).resolves.toBeUndefined();
      expect(status(persistent.jobId)).toBe('queued');
      release.resolve();
      await expect(preview).resolves.toBe('preview');
      await expect(
        service.runTransientPreview(async () => {
          throw new Error('bad preview parameters');
        }, new AbortController().signal),
      ).rejects.toThrow('bad preview parameters');
      await expect(
        service.runTransientPreview(
          async () => 'next preview',
          new AbortController().signal,
        ),
      ).resolves.toBe('next preview');
      expect(logger.error).not.toHaveBeenCalled();
      service.resume();
      await vi.waitFor(() =>
        expect(status(persistent.jobId)).toBe('succeeded'),
      );
    } finally {
      release.resolve();
    }
  });

  it('cancels active preview work through its request signal and then releases the shared slot', async () => {
    const service = start();
    const controller = new AbortController();
    const entered = Promise.withResolvers<void>();
    const cancelled = new Error('closed editor preview');
    const active = service.runTransientPreview(async (signal) => {
      entered.resolve();
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        }),
      );
      return 'must not finish';
    }, controller.signal);
    const rejected = expect(active).rejects.toBe(cancelled);
    await entered.promise;
    const next = service.runTransientPreview(
      async () => 'next preview',
      new AbortController().signal,
    );
    controller.abort(cancelled);
    await rejected;
    await expect(next).resolves.toBe('next preview');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('honors timestamp ordering among database previews, transient previews and persistent work', async () => {
    const release = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const started: string[] = [];
    vi.spyOn(processing, 'processMediaJob').mockImplementation(
      async (_runtime, id) => {
        started.push('persistent');
        finish(id);
      },
    );
    vi.spyOn(previewProcessing, 'processMediaPreview').mockImplementation(
      async (_runtime, id) => {
        started.push('database-preview');
        app.db
          .update(mediaPreviews)
          .set({ status: 'cancelled', cleanupStatus: 'deleted' })
          .where(eq(mediaPreviews.id, id))
          .run();
      },
    );
    const service = start();
    try {
      const occupied = service.runTransientPreview(async () => {
        entered.resolve();
        await release.promise;
        return 'occupied';
      }, new AbortController().signal);
      await entered.promise;
      const transient = service.runTransientPreview(async () => {
        started.push('transient');
        return 'transient';
      }, new AbortController().signal);
      const persistent = enqueue();
      app.db
        .update(mediaJobs)
        .set({ createdAt: new Date(Date.now() + 1000) })
        .where(eq(mediaJobs.id, persistent.jobId))
        .run();
      const now = new Date(Date.now() - 1000);
      app.db
        .insert(mediaPreviews)
        .values({
          id: randomUUID(),
          status: 'queued',
          cleanupStatus: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      release.resolve();
      await occupied;
      await transient;
      await vi.waitFor(() =>
        expect(status(persistent.jobId)).toBe('succeeded'),
      );
      expect(started).toEqual(['database-preview', 'transient', 'persistent']);
    } finally {
      release.resolve();
    }
  });

  it('applies dynamic concurrency changes to new claims without cancelling active previews', async () => {
    patchMediaSettings(app.db, { concurrency: 2 });
    const service = start();
    const gates = Array.from({ length: 4 }, () =>
      Promise.withResolvers<void>(),
    );
    const started: number[] = [];
    const signals: AbortSignal[] = [];
    const promises: Promise<number>[] = [];
    try {
      for (let index = 0; index < 3; index++)
        promises.push(
          service.runTransientPreview(async (signal) => {
            started.push(index);
            signals[index] = signal;
            await gates[index].promise;
            return index;
          }, new AbortController().signal),
        );
      await vi.waitFor(() => expect(started).toEqual([0, 1]));
      patchMediaSettings(app.db, { concurrency: 1 });
      gates[0].resolve();
      await promises[0];
      await delay(100);
      expect(started).toEqual([0, 1]);
      expect(signals[1].aborted).toBe(false);
      patchMediaSettings(app.db, { concurrency: 3 });
      promises.push(
        service.runTransientPreview(async (signal) => {
          started.push(3);
          signals[3] = signal;
          await gates[3].promise;
          return 3;
        }, new AbortController().signal),
      );
      await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
    } finally {
      for (const gate of gates) gate.resolve();
      await Promise.all(promises);
    }
  });

  it('rejects queued work immediately on stop and awaits active cancellation settlement', async () => {
    const service = start();
    const entered = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    let activeSignal: AbortSignal | undefined;
    const active = service.runTransientPreview(async (signal) => {
      activeSignal = signal;
      entered.resolve();
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      await cleanup.promise;
      throw signal.reason;
    }, new AbortController().signal);
    const activeRejected = expect(active).rejects.toMatchObject({
      code: 'MEDIA_INTERRUPTED',
    });
    await entered.promise;
    const operation = vi.fn(async () => 'must not run');
    const pending = service.runTransientPreview(
      operation,
      new AbortController().signal,
    );
    const pendingRejected = expect(pending).rejects.toMatchObject({
      code: 'MEDIA_INTERRUPTED',
    });
    let stopped = false;
    const stop = service.stop().then(() => {
      stopped = true;
    });
    try {
      await pendingRejected;
      expect(activeSignal?.aborted).toBe(true);
      expect(stopped).toBe(false);
      expect(operation).not.toHaveBeenCalled();
      await expect(
        service.runTransientPreview(
          async () => 'closed',
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'MEDIA_INTERRUPTED' });
    } finally {
      cleanup.resolve();
      await activeRejected;
      await stop;
    }
    await service.stop();
  });

  it('treats native shutdown failure as fatal and rejects other pending previews', async () => {
    const service = start();
    const error = mediaError(
      'MEDIA_TOOL_SHUTDOWN_FAILED',
      'native tool did not settle',
    );
    const first = service.runTransientPreview(async () => {
      throw error;
    }, new AbortController().signal);
    const rejected = expect(first).rejects.toBe(error);
    const operation = vi.fn(async () => 'must not run');
    const pending = service.runTransientPreview(
      operation,
      new AbortController().signal,
    );
    const pendingRejected = expect(pending).rejects.toMatchObject({
      code: 'MEDIA_INTERRUPTED',
    });
    await rejected;
    await pendingRejected;
    expect(operation).not.toHaveBeenCalled();
    await expect(service.stop()).rejects.toBe(error);
    queue = undefined;
  });
});
