import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  createSubmission,
  getSession,
} from '../../../src/server/upload/sessions.ts';
import { startUploadRuntime } from '../../../src/server/upload/runtime.ts';
import { trashImage } from '../../../src/server/media/trash.ts';
import { requestPermanentDelete } from '../../../src/server/media/cleanup.ts';
import { readUploadUsage } from '../../../src/server/upload/usage.ts';
import * as localStorage from '../../../src/server/storage/local.ts';

vi.mock('../../../src/server/media/file-formats.ts', () => ({
  identifyImageFile: vi.fn(async () => ({
    format: 'PNG',
    mime: 'image/png',
    extension: 'png',
    coder: 'png',
    width: 64,
    height: 48,
    identificationTags: {},
  })),
}));

let fixture: ReturnType<typeof collectionFixture>;
let runtime: ReturnType<typeof startUploadRuntime>;
let bytes: Buffer;
beforeEach(async () => {
  fixture = collectionFixture();
  bytes = await readFile('tests/fixtures/media-formats/source.png');
  runtime = startUploadRuntime({
    ...fixture,
    temporaryRoot: join(fixture.storageRoot, 'tmp'),
    logger: { info() {}, error() {} },
  });
});
afterEach(async () => {
  await runtime?.stop();
  fixture?.close();
  vi.restoreAllMocks();
});

function prepare(name = 'photo.png', visibility = 'public') {
  return createSubmission(fixture.db, {
    requestId: randomUUID(),
    visibility,
    files: [
      { queueItemId: 'file', originalName: name, declaredSize: bytes.length },
    ],
  }).sessions[0];
}
function request() {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'received.png');
  return new Request('http://localhost/upload', { method: 'POST', body: form });
}
async function upload(name?: string, visibility?: string) {
  const session = prepare(name, visibility);
  return runtime.receive(session.id, request());
}

it('hashes raw received bytes and skips a renamed duplicate without changing visibility or creating a job', async () => {
  const first = await upload('first.png', 'private');
  const duplicate = await upload('renamed.png', 'public');
  expect(duplicate).toMatchObject({
    state: 'duplicate',
    imageId: null,
    jobId: null,
    existingImageId: first.imageId,
    existingImageTrashed: false,
    cleanupStatus: 'none',
    temporaryKey: null,
    finalKey: null,
  });
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaImages).get()).toMatchObject({
    originalName: 'first.png',
    visibility: 'private',
  });
  expect(fixture.db.select().from(mediaObjects).get()).toMatchObject({
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  expect(readUploadUsage(fixture.db)).toEqual([]);
});

it('accepts different bytes with the same file name', async () => {
  const first = await upload();
  bytes = await readFile('tests/fixtures/media-formats/second.png');
  const second = await upload();
  expect(second.state).toBe('accepted');
  expect(second.imageId).not.toBe(first.imageId);
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(2);
});

it('serializes concurrent acceptance and cleans the losing candidate', async () => {
  const publish = localStorage.publishLocalObject;
  let reached = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(localStorage, 'publishLocalObject').mockImplementation(
    async (...args) => {
      if (++reached === 2) release();
      await gate;
      return publish(...args);
    },
  );
  const sessions = [prepare('one.png'), prepare('two.png')];
  const results = await Promise.all(
    sessions.map((session) => runtime.receive(session.id, request())),
  );
  expect(results.map((result) => result.state).sort()).toEqual([
    'accepted',
    'duplicate',
  ]);
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(1);
  const duplicate = results.find((result) => result.state === 'duplicate')!;
  expect(duplicate.cleanupStatus).toBe('none');
  await expect(
    stat(
      join(
        fixture.storageRoot,
        fixture.storage.localPath,
        'ariso',
        fixture.storage.id,
        'original',
        `${duplicate.candidateImageId}.png`,
      ),
    ),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

it('reports trash matches but permits uploading content being permanently deleted', async () => {
  const first = await upload();
  trashImage(fixture.db, first.imageId!);
  expect(await upload()).toMatchObject({
    state: 'duplicate',
    existingImageId: first.imageId,
    existingImageTrashed: true,
  });
  requestPermanentDelete(fixture.db, first.imageId!);
  expect((await upload()).state).toBe('accepted');
});

it('matches an original in a disabled storage instead of duplicating it in another storage', async () => {
  const first = await upload();
  const storage = fixture.db.select().from(storageConfigs).get()!;
  fixture.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, storage.id))
    .run();
  fixture.db
    .insert(storageConfigs)
    .values({
      ...storage,
      id: 'other',
      name: 'other',
      localPath: 'other',
      enabled: true,
    })
    .run();
  const session = createSubmission(fixture.db, {
    requestId: randomUUID(),
    storageId: 'other',
    files: [
      {
        queueItemId: 'q',
        originalName: 'same.png',
        declaredSize: bytes.length,
      },
    ],
  }).sessions[0];
  expect(await runtime.receive(session.id, request())).toMatchObject({
    state: 'duplicate',
    existingImageId: first.imageId,
  });
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
});

it('retains duplicate cleanup responsibility and its finite budget across restart until explicitly retried', async () => {
  const first = await upload();
  const remove = vi
    .spyOn(localStorage, 'deleteObject')
    .mockRejectedValue(new Error('object deletion failed'));
  const duplicate = await upload();
  expect(duplicate).toMatchObject({
    state: 'duplicate',
    cleanupStatus: 'pending',
    cleanupAttempts: 1,
  });
  expect(readUploadUsage(fixture.db)[0].knownBytes).toBe(bytes.length);
  // Maintenance retries retain their budget; restarting never replenishes it.
  const { cleanupSession } =
    await import('../../../src/server/upload/cleanup.ts');
  await expect(cleanupSession(fixture, duplicate.id)).rejects.toThrow(
    'object deletion failed',
  );
  await expect(cleanupSession(fixture, duplicate.id)).rejects.toThrow(
    'object deletion failed',
  );
  await runtime.stop();
  runtime = startUploadRuntime({
    ...fixture,
    logger: { info() {}, error() {} },
  });
  expect(getSession(fixture.db, duplicate.id)).toMatchObject({
    state: 'duplicate',
    cleanupStatus: 'failed',
    cleanupAttempts: 3,
    nextCleanupAt: null,
  });
  remove.mockRestore();
  expect(await runtime.retryCleanup(duplicate.id)).toMatchObject({
    state: 'duplicate',
    cleanupStatus: 'none',
  });
  expect(readUploadUsage(fixture.db)).toEqual([]);
  expect(fixture.db.select().from(mediaImages).get()?.id).toBe(first.imageId);
});

it('keeps duplicate terminal results across restart and cancellation is idempotent for the finished result', async () => {
  await upload();
  const duplicate = await upload();
  await runtime.stop();
  runtime = startUploadRuntime({
    ...fixture,
    logger: { info() {}, error() {} },
  });
  expect(getSession(fixture.db, duplicate.id).state).toBe('duplicate');
  expect(await runtime.cancel(duplicate.id)).toMatchObject({
    state: 'duplicate',
    existingImageId: duplicate.existingImageId,
  });
});
