import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { startMediaQueue } from '../../../src/server/media/queue.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { mediaImages, mediaJobs } from '../../../src/server/media/schema.ts';
import { mediaReplacements } from '../../../src/server/media/replacement-schema.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import type { MediaRuntime } from '../../../src/server/media/process.ts';

const previewBoundary = vi.hoisted(() => ({ delay: Promise.resolve() }));
vi.mock('../../../src/server/media/previews.ts', async (original) => {
  const actual =
    await original<typeof import('../../../src/server/media/previews.ts')>();
  return {
    ...actual,
    startPreviewRuntime(runtime: MediaRuntime) {
      const previews = actual.startPreviewRuntime(runtime);
      return {
        ...previews,
        ready: previews.ready.then(() => previewBoundary.delay),
      };
    },
  };
});

it('recovers the old receiving attempt before waiting for preview cleanup and preserves a new live reception', async () => {
  const fixture = collectionFixture();
  const temporaryRoot = join(fixture.storageRoot, '..', 'tmp');
  mkdirSync(temporaryRoot);
  const runtime: MediaRuntime = {
    db: fixture.db,
    storageRoot: fixture.storageRoot,
    temporaryRoot,
    logger: createRuntimeLogger('replacement.recovery.test', 'fatal'),
  };
  let release!: () => void;
  previewBoundary.delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  let queue: ReturnType<typeof startMediaQueue> | undefined;
  function readyImage(imageId: string) {
    const accepted = fixture.db.transaction((tx) =>
      acceptOriginal(tx, fixture.input(imageId)),
    );
    fixture.db
      .update(mediaJobs)
      .set({ status: 'succeeded', step: 'complete', finishedAt: new Date() })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    fixture.db
      .update(mediaImages)
      .set({ processingStatus: 'ready', classification: 'static' })
      .where(eq(mediaImages.id, imageId))
      .run();
  }
  function receiving(imageId: string, jobId: string) {
    fixture.db.transaction((tx) => {
      const now = new Date();
      tx.insert(mediaJobs)
        .values({
          id: jobId,
          imageId,
          kind: 'replace',
          scope: 'all',
          snapshot: fixture.input(imageId).snapshot,
          expectedVersions: [],
          status: 'running',
          step: 'receiving',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(mediaReplacements)
        .values({
          jobId,
          imageId,
          originalName: '接收中的新图片.png',
          snapshots: {},
        })
        .run();
    });
  }
  const status = (jobId: string) =>
    fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get()!;
  try {
    readyImage('existing-image');
    readyImage('current-image');
    receiving('existing-image', 'before-startup');
    queue = startMediaQueue(runtime);
    // A request may start while old preview directories are still being removed.
    receiving('current-image', 'after-startup');
    release();
    await queue.previews.ready;
    expect(status('before-startup')).toMatchObject({ status: 'failed' });
    expect(status('before-startup').error).toContain('MEDIA_INTERRUPTED');
    expect(status('after-startup')).toMatchObject({
      status: 'running',
      step: 'receiving',
      error: null,
    });
  } finally {
    release();
    await queue?.stop();
    fixture.close();
  }
});
