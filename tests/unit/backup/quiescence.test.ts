import { describe, expect, it } from 'vitest';
import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';
import { createBackupQuiescence } from '../../../src/server/backup/quiescence.ts';

function background() {
  let paused = false;
  let running = Promise.resolve();
  return {
    get paused() {
      return paused;
    },
    start(operation: Promise<void>) {
      running = operation;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    waitForIdle() {
      return running;
    },
  };
}

function fixture() {
  const contentMutations = createContentMutations();
  const mediaQueue = background();
  const uploads = background();
  const storageMaintenance = background();
  const storageProbes = background();
  const watermarks = background();
  const branding = background();
  let flushed = false;
  const services = [
    mediaQueue,
    uploads,
    storageMaintenance,
    storageProbes,
    watermarks,
  ];
  const quiescence = createBackupQuiescence({
    contentMutations,
    mediaQueue,
    uploads,
    storageMaintenance,
    storageProbes,
    watermarks,
    branding,
    flushAnalytics() {
      flushed = true;
    },
  });
  return {
    contentMutations,
    mediaQueue,
    services,
    quiescence,
    get flushed() {
      return flushed;
    },
  };
}

describe('backup quiescence', () => {
  it('lets an accepted upload finish its queued media before pausing persistent work', async () => {
    const f = fixture();
    const image = Promise.withResolvers<void>();
    const upload = f.contentMutations.run('public-upload', () => image.promise);
    const preparing = f.quiescence.acquire();
    expect(f.contentMutations.paused).toBe(true);
    expect(f.mediaQueue.paused).toBe(false);
    image.resolve();
    await upload;
    const release = await preparing;
    expect(f.services.every((service) => service.paused)).toBe(true);
    expect(f.flushed).toBe(true);
    release();
    release();
    expect(f.services.every((service) => !service.paused)).toBe(true);
    expect(f.contentMutations.paused).toBe(false);
  });

  it('waits for an already running persistent operation before returning the snapshot boundary', async () => {
    const f = fixture();
    const operation = Promise.withResolvers<void>();
    f.mediaQueue.start(operation.promise);
    let acquired = false;
    const preparing = f.quiescence.acquire().then((release) => {
      acquired = true;
      return release;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(f.flushed).toBe(false);
    operation.resolve();
    const release = await preparing;
    expect(f.flushed).toBe(true);
    release();
  });

  it('timeouts only the preparation and reopens admission without cancelling the upload', async () => {
    const f = fixture();
    const pending = Promise.withResolvers<void>();
    const upload = f.contentMutations.run('upload', () => pending.promise);
    await expect(f.quiescence.acquire(undefined, 10)).rejects.toMatchObject({
      code: 'BACKUP_PREPARATION_TIMEOUT',
    });
    expect(f.contentMutations.paused).toBe(false);
    expect(f.services.every((service) => !service.paused)).toBe(true);
    expect(f.contentMutations.activeCount).toBe(1);
    pending.resolve();
    await upload;
  });

  it('restores every service even if one resume throws', async () => {
    const f = fixture();
    const release = await f.quiescence.acquire();
    f.mediaQueue.resume = () => {
      throw new Error('resume failed');
    };
    expect(release).toThrow('resume failed');
    expect(f.services.slice(1).every((service) => !service.paused)).toBe(true);
    expect(f.contentMutations.paused).toBe(false);
  });
});
