import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanupPermanentDeletes,
  readMediaCleanup,
  requestPermanentDelete,
  retryMediaCleanup,
} from '../../../src/server/media/cleanup.ts';
import { recoverMediaCandidateCleanup } from '../../../src/server/media/candidate-cleanup.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { getStorageReferences } from '../../../src/server/media/references.ts';
import { recoverMediaJobs } from '../../../src/server/media/recovery.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import {
  completeMediaJob,
  saveMediaCandidate,
} from '../../../src/server/media/steps.ts';
import * as mediaStorage from '../../../src/server/media/storage.ts';
import { restoreImage, trashImage } from '../../../src/server/media/trash.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { prepareInitialStorage } from '../../../src/server/storage/defaults.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { createSubmission } from '../../../src/server/upload/sessions.ts';
import { uploadSessions } from '../../../src/server/upload/schema.ts';
import { readUploadReferences } from '../../../src/server/upload/usage.ts';
import { startUploadEndpoint } from '../upload/s3-endpoint.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let endpoint: Awaited<ReturnType<typeof startUploadEndpoint>>;
let client: ReturnType<typeof createS3Storage>;
let storageId: string;
let secretCrypto: ReturnType<typeof createSecretCrypto>;
const runtime = () => ({
  db: connection.db,
  storageRoot: join(directory, 'storage'),
  temporaryRoot: join(directory, 'tmp'),
  secretCrypto,
  logger: { info: vi.fn(), error: vi.fn() },
});
const cleanup = (activeImages: ReadonlySet<string> = new Set()) =>
  cleanupPermanentDeletes(runtime(), activeImages);
const path = (key: string) =>
  `/${endpoint.target.bucket}/ariso/${storageId}/${key}`;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-s3-delete-'));
  await mkdir(join(directory, 'storage'));
  await mkdir(join(directory, 'tmp'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: runtime().storageRoot });
  connection.db.transaction(prepareInitialMedia);
  endpoint = await startUploadEndpoint();
  storageId = `delete-163-${randomUUID()}`;
  secretCrypto = createSecretCrypto(randomBytes(32));
  client = createS3Storage({
    ...endpoint.target,
    id: storageId,
    enabled: true,
    pathPrefix: '',
  });
  connection.db
    .insert(storageConfigs)
    .values({
      id: storageId,
      name: 'S3 delete fixture',
      type: 's3',
      enabled: true,
      endpoint: endpoint.target.endpoint,
      region: endpoint.target.region,
      bucket: endpoint.target.bucket,
      forcePathStyle: true,
      pathPrefix: '',
      accessKeyEncrypted: secretCrypto.encryptSecret(
        endpoint.target.credentials.accessKeyId,
      ),
      secretKeyEncrypted: secretCrypto.encryptSecret(
        endpoint.target.credentials.secretAccessKey,
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
});
afterEach(async () => {
  vi.restoreAllMocks();
  client.destroy();
  await endpoint.close();
  connection.close();
  await rm(directory, { recursive: true, force: true });
});

async function asset() {
  const imageId = randomUUID();
  const key = `original/${imageId}/中文 +%?.png`;
  await client.writeObject(key, Readable.from(['original bytes']), {
    size: 14,
    contentType: 'image/png',
  });
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId,
      storageId,
      key,
      originalName: 'delete.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 14,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: [],
    }),
  );
  connection.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.id, accepted.jobId))
    .run();
  return { ...accepted, key };
}
async function extra(
  image: Awaited<ReturnType<typeof asset>>,
  status: (typeof mediaObjects.$inferSelect)['status'],
  present = true,
) {
  const id = randomUUID();
  const key = `images/${image.imageId}/candidate/${id}`;
  if (present)
    await client.writeObject(key, Readable.from(['extra']), {
      size: 5,
      contentType: 'image/png',
    });
  connection.db
    .insert(mediaObjects)
    .values({
      id,
      imageId: image.imageId,
      jobId: image.jobId,
      storageId,
      key,
      purpose: 'thumbnail',
      status,
      byteSize: ['writing', 'planned'].includes(status) ? null : 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return { id, key };
}
function reopen() {
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  recoverMediaCandidateCleanup(connection.db);
  recoverMediaJobs(connection.db);
}

it('clears all owned S3 states on disabled storage while preserving a separate active upload reference', async () => {
  const image = await asset();
  expect(() => requestPermanentDelete(connection.db, image.imageId)).toThrow(
    '只能永久删除回收站',
  );
  const keys = [image.key];
  for (const status of [
    'stored',
    'writing',
    'planned',
    'cleanup_pending',
    'cleanup_failed',
  ] as const)
    keys.push((await extra(image, status, status !== 'planned')).key);
  const submission = createSubmission(connection.db, {
    requestId: randomUUID(),
    storageId,
    files: [
      {
        queueItemId: randomUUID(),
        originalName: 'upload.png',
        declaredSize: 5,
      },
    ],
  });
  const session = submission.sessions[0];
  const uploadKey = `upload/active-${session.id}`;
  await client.writeObject(uploadKey, Readable.from(['extra']), {
    size: 5,
    contentType: 'image/png',
  });
  connection.db
    .update(uploadSessions)
    .set({ state: 'receiving', temporaryKey: uploadKey })
    .where(eq(uploadSessions.id, session.id))
    .run();
  const beforeUpload = readUploadReferences(connection.db);
  trashImage(connection.db, image.imageId);
  const accepted = requestPermanentDelete(connection.db, image.imageId);
  expect(requestPermanentDelete(connection.db, image.imageId)).toEqual(
    accepted,
  );
  connection.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, storageId))
    .run();
  expect(() => restoreImage(connection.db, image.imageId)).toThrow(
    '已开始永久删除',
  );
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'succeeded',
    remaining: [],
  });
  for (const key of keys) expect(await client.inspectObject(key)).toBeNull();
  expect(await client.inspectObject(uploadKey)).toMatchObject({ size: 5 });
  expect(readUploadReferences(connection.db)).toEqual(beforeUpload);
  expect(
    connection.db.transaction((tx) => getStorageReferences(tx, storageId)),
  ).toEqual({
    storageId,
    images: [],
    versions: [],
    objects: [],
    jobs: [],
    cleanupJobs: [],
  });
  expect(
    endpoint.requests
      .filter((request) => request.method === 'DELETE')
      .map((request) => request.path)
      .sort(),
  ).toEqual(keys.map(path).sort());
  expect(requestPermanentDelete(connection.db, image.imageId)).toEqual(
    readMediaCleanup(connection.db, image.imageId),
  );
});

it('preserves partial success and two DELETE attempts across restart, with a fresh manual finite cycle', async () => {
  const image = await asset();
  const failed = await extra(image, 'writing');
  const actual = mediaStorage.deleteMediaObject;
  const spy = vi
    .spyOn(mediaStorage, 'deleteMediaObject')
    .mockImplementation(async (...args) => {
      if (args[2] === failed.key)
        throw Object.assign(new Error('S3 network interrupted'), {
          code: 'ECONNRESET',
        });
      return actual(...args);
    });
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'running',
    remaining: [
      { key: failed.key, byteSize: 5, attempts: 1, status: 'cleanup_pending' },
    ],
  });
  expect(await client.inspectObject(image.key)).toBeNull();
  reopen();
  await cleanup();
  expect(spy.mock.calls.filter((args) => args[2] === failed.key)).toHaveLength(
    1,
  );
  connection.db
    .update(mediaObjects)
    .set({ nextCleanupAt: new Date(0) })
    .run();
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'failed',
    remaining: [
      {
        attempts: 2,
        key: failed.key,
        error: expect.stringContaining('S3 network interrupted'),
      },
    ],
  });
  reopen();
  await cleanup();
  expect(spy.mock.calls.filter((args) => args[2] === failed.key)).toHaveLength(
    2,
  );
  spy.mockRestore();
  expect(retryMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'queued',
    cycle: 2,
    remaining: [{ attempts: 0 }],
  });
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'succeeded',
    cycle: 2,
    remaining: [],
  });
  expect(await client.inspectObject(failed.key)).toBeNull();
});

it('preserves a real S3 AccessDenied diagnostic and performs no automatic retry', async () => {
  const image = await asset();
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  endpoint.faults.delete = true;
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'failed',
    remaining: [
      {
        attempts: 1,
        error: expect.stringContaining('AccessDenied'),
      },
    ],
  });
  expect(
    connection.db.transaction((tx) => getStorageReferences(tx, storageId))
      .objects,
  ).toHaveLength(1);
  reopen();
  await cleanup();
  expect(
    endpoint.requests.filter((request) => request.method === 'DELETE'),
  ).toHaveLength(1);
  expect(await client.inspectObject(image.key)).toMatchObject({ size: 14 });
  endpoint.faults.delete = false;
  retryMediaCleanup(connection.db, image.imageId);
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
    'succeeded',
  );
});

it('reconciles remote absence after DELETE committed but its exhausted durable intent did not settle', async () => {
  const image = await asset();
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  connection.db.$client.exec(
    "CREATE TRIGGER reject_deleted BEFORE UPDATE OF status ON media_objects WHEN NEW.status = 'deleted' BEGIN SELECT RAISE(ABORT, 'settlement failure'); END",
  );
  await expect(cleanup()).rejects.toThrow('settlement failure');
  expect(await client.inspectObject(image.key)).toBeNull();
  connection.db.$client.exec('DROP TRIGGER reject_deleted');
  connection.db.update(mediaObjects).set({ cleanupAttempts: 2 }).run();
  reopen();
  const deletes = endpoint.requests.filter(
    (request) => request.method === 'DELETE',
  ).length;
  await cleanup();
  expect(
    endpoint.requests.filter((request) => request.method === 'DELETE'),
  ).toHaveLength(deletes);
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'succeeded',
    remaining: [],
  });
});

it('waits for local writer settlement and rejects late publication by deleting and terminal jobs', async () => {
  const image = await asset();
  connection.db
    .update(mediaJobs)
    .set({ status: 'running', expectedVersions: ['thumbnail'] })
    .where(eq(mediaJobs.id, image.jobId))
    .run();
  const candidate = await extra(image, 'writing');
  const versions = connection.db.select().from(mediaVersions).all();
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  await cleanup(new Set([image.imageId]));
  await cleanup();
  expect(
    endpoint.requests.filter((request) => request.method === 'DELETE'),
  ).toEqual([]);
  expect(() =>
    saveMediaCandidate(connection.db, image.jobId, 'thumbnail', candidate.id, {
      size: 5,
      width: 1,
      height: 1,
      format: 'PNG',
      mime: 'image/png',
    }),
  ).toThrow('Image is being deleted');
  expect(() => completeMediaJob(connection.db, image.jobId)).toThrow(
    'Image is being deleted',
  );
  connection.db
    .update(mediaJobs)
    .set({ status: 'cancelled' })
    .where(eq(mediaJobs.id, image.jobId))
    .run();
  expect(() => completeMediaJob(connection.db, image.jobId)).toThrow(
    'not running',
  );
  expect(connection.db.select().from(mediaVersions).all()).toEqual(versions);
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
    'succeeded',
  );
  expect(await client.inspectObject(candidate.key)).toBeNull();
});

it('cleans a settled unknown PUT without waiting for remote eternity, and leaves post-release late objects to T-STO-06', async () => {
  const image = await asset();
  const unknown = await extra(image, 'writing');
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  await cleanup(new Set([image.imageId]));
  expect(
    connection.db
      .transaction((tx) => getStorageReferences(tx, storageId))
      .objects.map((object) => object.key),
  ).toContain(unknown.key);
  await cleanup();
  expect(await client.inspectObject(unknown.key)).toBeNull();
  expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
    'succeeded',
  );
  endpoint.put(path(unknown.key), Buffer.from('late remote bytes'));
  await cleanup();
  expect(await client.inspectObject(unknown.key)).toMatchObject({ size: 17 });
  expect(connection.db.select().from(mediaImages).all()).toEqual([]);
  expect(
    connection.db.transaction((tx) => getStorageReferences(tx, storageId))
      .objects,
  ).toEqual([]);
  expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
    'succeeded',
  );
});

it('uses the owning finite retry budget for actual HTTP 503 responses rather than SDK retries', async () => {
  const image = await asset();
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  let deletes = 0;
  const faultServer = createServer((request, response) => {
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'content-length': '14' });
      response.end();
    } else {
      deletes++;
      response.writeHead(503, { 'content-type': 'application/xml' });
      response.end(
        '<Error><Code>ServiceUnavailable</Code><Message>maintenance unavailable</Message></Error>',
      );
    }
  });
  faultServer.listen(0, '127.0.0.1');
  await once(faultServer, 'listening');
  const address = faultServer.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fault endpoint');
  connection.db
    .update(storageConfigs)
    .set({ endpoint: `http://127.0.0.1:${address.port}` })
    .where(eq(storageConfigs.id, storageId))
    .run();
  try {
    await cleanup();
    expect(deletes).toBe(1);
    expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
      status: 'running',
      remaining: [
        {
          attempts: 1,
          status: 'cleanup_pending',
          error: expect.stringContaining('maintenance unavailable'),
        },
      ],
    });
    reopen();
    await cleanup();
    expect(deletes).toBe(1);
    connection.db
      .update(mediaObjects)
      .set({ nextCleanupAt: new Date(0) })
      .run();
    await cleanup();
    expect(deletes).toBe(2);
    expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
      status: 'failed',
      remaining: [{ attempts: 2 }],
    });
    reopen();
    await cleanup();
    expect(deletes).toBe(2);
    connection.db
      .update(storageConfigs)
      .set({ endpoint: endpoint.target.endpoint })
      .where(eq(storageConfigs.id, storageId))
      .run();
    retryMediaCleanup(connection.db, image.imageId);
    await cleanup();
    expect(await client.inspectObject(image.key)).toBeNull();
    expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
      'succeeded',
    );
  } finally {
    const closed = once(faultServer, 'close');
    faultServer.closeAllConnections();
    faultServer.close();
    await closed;
  }
});

it.each(['HEAD', 'DELETE'] as const)(
  'shutdown interrupts an actual in-flight %s without settling a business failure or resetting intent',
  async (stage) => {
    const image = await asset();
    trashImage(connection.db, image.imageId);
    requestPermanentDelete(connection.db, image.imageId);
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const faultServer = createServer((request, response) => {
      if (request.method === stage) {
        entered();
        return;
      }
      response.writeHead(200, { 'content-length': '14' });
      response.end();
    });
    faultServer.listen(0, '127.0.0.1');
    await once(faultServer, 'listening');
    const address = faultServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing stalled endpoint');
    connection.db
      .update(storageConfigs)
      .set({ endpoint: `http://127.0.0.1:${address.port}` })
      .where(eq(storageConfigs.id, storageId))
      .run();
    try {
      const controller = new AbortController();
      const pending = cleanupPermanentDeletes(
        runtime(),
        new Set(),
        controller.signal,
      );
      const outcome = pending.then(
        () => undefined,
        (error: unknown) => error,
      );
      await started;
      controller.abort(new Error('scheduler shutdown'));
      expect(await outcome).toBeInstanceOf(Error);
      expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
        status: 'running',
        cycle: 1,
        remaining: [
          {
            status: 'cleanup_pending',
            attempts: 1,
            error: null,
          },
        ],
      });
      reopen();
      connection.db
        .update(storageConfigs)
        .set({ endpoint: endpoint.target.endpoint })
        .where(eq(storageConfigs.id, storageId))
        .run();
      await cleanup();
      expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
        status: 'succeeded',
        cycle: 1,
        remaining: [],
      });
    } finally {
      const closed = once(faultServer, 'close');
      faultServer.closeAllConnections();
      faultServer.close();
      await closed;
    }
  },
);
