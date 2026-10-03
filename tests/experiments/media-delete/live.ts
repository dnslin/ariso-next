import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { S3Client, paginateListObjectsV2 } from '@aws-sdk/client-s3';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { prepareImageDelivery } from '../../../src/server/delivery/response.ts';
import {
  cleanupPermanentDeletes,
  readMediaCleanup,
  requestPermanentDelete,
  retryMediaCleanup,
} from '../../../src/server/media/cleanup.ts';
import { recoverMediaCandidateCleanup } from '../../../src/server/media/candidate-cleanup.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import { processMediaJob } from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { getStorageReferences } from '../../../src/server/media/references.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import { recoverMediaJobs } from '../../../src/server/media/recovery.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import { completeMediaJob } from '../../../src/server/media/steps.ts';
import { writeMediaObject } from '../../../src/server/media/storage.ts';
import { trashImage } from '../../../src/server/media/trash.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { createSubmission } from '../../../src/server/upload/sessions.ts';
import { uploadSessions } from '../../../src/server/upload/schema.ts';
import { readUploadReferences } from '../../../src/server/upload/usage.ts';
import { collectionFixture } from '../../integration/collections/helpers.ts';
import { configSchema } from '../storage-s3/config.ts';

const fields = configSchema.shape;
const targetSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  endpoint: fields.endpoint,
  region: fields.region,
  bucket: fields.bucket,
  forcePathStyle: fields.forcePathStyle,
  credentials: fields.credentials,
});
type Target = z.infer<typeof targetSchema>;
const logger = { info() {}, error() {} };
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/media-163-live' },
    service: { type: 'string' },
    worker: { type: 'boolean', default: false },
    db: { type: 'string' },
    storage: { type: 'string' },
    job: { type: 'string' },
  },
});
assert.equal(process.versions.node.split('.')[0], '24');
assert.ok(values.config, '--config must specify a private target file');
const targets = targetSchema
  .array()
  .parse(JSON.parse(await readFile(values.config, 'utf8')))
  .filter((target) => !values.service || target.service === values.service);
assert.ok(targets.length > 0);

if (values.worker) {
  assert.ok(
    values.db &&
      values.storage &&
      values.job &&
      process.env.MEDIA_DELETE_TEST_KEY,
  );
  const local = openRuntimeDatabase(values.db);
  const runtime = {
    db: local.db,
    storageRoot: join(dirname(values.db), 'storage'),
    temporaryRoot: join(dirname(values.db), 'tmp'),
    secretCrypto: createSecretCrypto(
      Buffer.from(process.env.MEDIA_DELETE_TEST_KEY, 'hex'),
    ),
    logger,
  };
  try {
    const plan = local.db.transaction((tx) => {
      const candidate = planDerivedObject(tx, values.job!, 'thumbnail');
      tx.update(mediaObjects)
        .set({ status: 'writing' })
        .where(eq(mediaObjects.id, candidate.objectId))
        .run();
      return candidate;
    });
    process.send!({
      checkpoint: 'planned',
      key: plan.key,
      objectId: plan.objectId,
    });
    // Exercise the production media single-PUT path. No candidate acknowledgement is committed.
    const config = local.db
      .select()
      .from(storageConfigs)
      .where(eq(storageConfigs.id, values.storage))
      .get()!;
    await writeMediaObject(
      runtime,
      config,
      plan,
      Readable.from(['unknown real PUT']),
      'image/png',
      join(runtime.temporaryRoot, `unknown-${plan.objectId}`),
      AbortSignal.timeout(30000),
    );
    process.send!({
      checkpoint: 'put-written-unsettled',
      key: plan.key,
      objectId: plan.objectId,
    });
    // Keep the IPC channel alive until the parent kills this checkpoint worker.
    process.on('message', () => {});
    await new Promise<void>(() => {});
  } finally {
    local.close();
  }
} else {
  await mkdir(resolve(values.output), { recursive: true });
  const output = await mkdtemp(join(resolve(values.output), 'run-'));
  console.log(output);
  for (const target of targets) {
    if (!(await runTarget(target, output))) process.exitCode = 1;
  }
}

async function runTarget(target: Target, output: string) {
  const fixture = collectionFixture();
  const databasePath = join(dirname(fixture.storageRoot), 'ariso.db');
  const temporaryRoot = join(dirname(fixture.storageRoot), 'tmp');
  await mkdir(temporaryRoot);
  const encryptionKey = randomBytes(32);
  const secretCrypto = createSecretCrypto(encryptionKey);
  const storageId = `delete-163-${randomUUID()}`;
  const client = createS3Storage({
    ...target,
    id: storageId,
    pathPrefix: '',
    enabled: true,
  });
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  let child: ReturnType<typeof fork> | undefined;
  let closed: Promise<unknown[]> | undefined;
  const db = () => connection?.db ?? fixture.db;
  const runtime = () => ({
    db: db(),
    storageRoot: fixture.storageRoot,
    temporaryRoot,
    secretCrypto,
    logger: liveLogger,
  });
  const report = {
    service: target.service,
    endpoint: target.endpoint,
    bucket: target.bucket,
    storageId,
    namespace: `ariso/${storageId}/`,
    databasePath,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    status: 'running' as 'running' | 'passed' | 'failed',
    keys: [] as string[],
    diagnostics: [] as { message: string; fields: unknown }[],
    finalObjects: [] as { key: string | undefined; size: number | undefined }[],
    checks: [] as {
      name: string;
      status: 'passed' | 'failed';
      detail: unknown;
    }[],
    cleanup: [] as {
      key: string;
      status: 'absent' | 'failed';
      error?: string;
    }[],
    limits: [
      'Only isolated media/delete data and exact registered keys; no bucket policy, CORS, deployment or release changes.',
      'Response loss is injected by a local gateway only after a real service PUT 200. SIGKILL before local candidate settlement is a separate window.',
      'Post-release late PUT is intentionally replayed; production namespace scanner belongs to T-STO-06 and is not implemented here.',
      'AWS, containers and UI are not validated by this backend experiment.',
    ],
  };
  const liveLogger = {
    info() {},
    error(fields: unknown, message = '') {
      report.diagnostics.push({
        message,
        fields: JSON.parse(
          JSON.stringify(fields, (_key, value) =>
            value instanceof Error
              ? {
                  message: value.message,
                  name: value.name,
                  code: (value as Error & { code?: string }).code,
                }
              : value,
          ),
        ),
      });
    },
  };
  const listClient = new S3Client({ ...target, maxAttempts: 1 });
  async function listObjects() {
    const objects: { key: string | undefined; size: number | undefined }[] = [];
    for await (const page of paginateListObjectsV2(
      { client: listClient },
      { Bucket: target.bucket, Prefix: `ariso/${storageId}/` },
    )) {
      for (const object of page.Contents ?? [])
        objects.push({ key: object.Key, size: object.Size });
    }
    return objects.sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));
  }
  const reportPath = join(output, `${target.service}.json`);
  const save = () =>
    writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  function track(key: string) {
    if (!report.keys.includes(key)) report.keys.push(key);
  }
  async function check(name: string, run: () => Promise<unknown>) {
    try {
      const detail = await run();
      report.checks.push({ name, status: 'passed', detail });
      await save();
      console.log(`${target.service}: ${name}`);
    } catch (error) {
      report.checks.push({
        name,
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
      await save();
      throw error;
    }
  }
  async function linkStatus(imageId: string) {
    return (
      await prepareImageDelivery(
        new Request(`http://ariso.test/f/${imageId}?v=original`),
        imageId,
        {
          db: db(),
          storageRoot: fixture.storageRoot,
          secretCrypto,
          readOwner: async () => true,
          logger,
        },
      )
    ).status;
  }
  async function seed() {
    const bytes = await readFile('tests/fixtures/runtime/images/sample.png');
    const imageId = randomUUID();
    const key = `original/${imageId}.png`;
    track(key);
    await save();
    await client.writeObject(key, Readable.from([bytes]), {
      size: bytes.length,
      contentType: 'image/png',
      signal: AbortSignal.timeout(30000),
    });
    return db().transaction((tx) =>
      acceptOriginal(tx, {
        imageId,
        storageId,
        key,
        originalName: 'live-delete.png',
        visibility: 'public',
        format: 'PNG',
        mime: 'image/png',
        byteSize: bytes.length,
        snapshot: createProcessingSnapshot(tx),
        expectedVersions: ['compressed', 'thumbnail'],
      }),
    );
  }
  const now = new Date();
  db()
    .insert(storageConfigs)
    .values({
      id: storageId,
      name: 'Issue 163 isolated fixture',
      type: 's3',
      enabled: true,
      endpoint: target.endpoint,
      region: target.region,
      bucket: target.bucket,
      forcePathStyle: target.forcePathStyle,
      pathPrefix: '',
      accessKeyEncrypted: secretCrypto.encryptSecret(
        target.credentials.accessKeyId,
      ),
      secretKeyEncrypted: secretCrypto.encryptSecret(
        target.credentials.secretAccessKey,
      ),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  await save();
  try {
    const image = await seed();
    await check('real-media-processing-and-published-original', async () => {
      assert.equal(claimNextMediaJob(db())!.id, image.jobId);
      await processMediaJob(runtime(), image.jobId);
      assert.equal(
        db()
          .select()
          .from(mediaImages)
          .where(eq(mediaImages.id, image.imageId))
          .get()!.processingStatus,
        'ready',
      );
      const objects = db().select().from(mediaObjects).all();
      objects.forEach((object) => track(object.key));
      assert.equal(await linkStatus(image.imageId), 302);
      return {
        imageId: image.imageId,
        jobId: image.jobId,
        objects,
        versions: db().select().from(mediaVersions).all(),
      };
    });
    await check(
      'actual-processing-PUT-response-loss-retains-owned-key-and-old-publication',
      async () => {
        const beforeVersions = db().select().from(mediaVersions).all();
        const forwarded: {
          key: string;
          remoteHttpStatus: number | undefined;
          size: number;
        }[] = [];
        const failures: string[] = [];
        const proxy = createServer(async (request, response) => {
          const prefix = `/${target.bucket}/ariso/${storageId}/`;
          const pathname = decodeURIComponent(
            new URL(request.url!, 'http://localhost').pathname,
          );
          if (!pathname.startsWith(prefix)) {
            response.writeHead(404);
            response.end();
            return;
          }
          const key = pathname.slice(prefix.length);
          try {
            if (request.method === 'GET') {
              const source = await client.readObject(key, {
                signal: AbortSignal.timeout(30000),
              });
              response.writeHead(200, {
                'content-type': source.contentType ?? 'image/png',
                'content-length': String(source.size),
                etag: source.etag ?? '',
              });
              await pipeline(source.stream, response);
            } else if (request.method === 'PUT') {
              const size = Number(request.headers['content-length']);
              track(key);
              await save();
              const written = await client.writeObject(key, request, {
                size,
                contentType: String(request.headers['content-type']),
                signal: AbortSignal.timeout(30000),
              });
              forwarded.push({
                key,
                remoteHttpStatus: written.metadata.httpStatusCode,
                size,
              });
              // The real service has replied 200. Deliberately drop the acknowledgement to the production writer.
              response.destroy();
            } else {
              response.writeHead(405);
              response.end();
            }
          } catch (error) {
            failures.push(
              error instanceof Error ? error.message : String(error),
            );
            response.destroy();
          }
        });
        proxy.listen(0, '127.0.0.1');
        await once(proxy, 'listening');
        const address = proxy.address();
        assert.ok(address && typeof address !== 'string');
        const reprocess = requestReprocess(db(), image.imageId, {
          scope: 'thumbnail',
        });
        db()
          .update(storageConfigs)
          .set({
            endpoint: `http://127.0.0.1:${address.port}`,
            forcePathStyle: true,
          })
          .where(eq(storageConfigs.id, storageId))
          .run();
        try {
          assert.equal(claimNextMediaJob(db())!.id, reprocess.jobId);
          await processMediaJob(runtime(), reprocess.jobId);
          assert.deepEqual(failures, []);
          assert.equal(forwarded.length, 1);
          assert.equal(forwarded[0].remoteHttpStatus, 200);
          assert.equal(
            (await client.inspectObject(forwarded[0].key))!.size,
            forwarded[0].size,
          );
          const unknown = db()
            .select()
            .from(mediaObjects)
            .where(eq(mediaObjects.key, forwarded[0].key))
            .get()!;
          assert.equal(unknown.byteSize, null);
          assert.notEqual(unknown.status, 'stored');
          assert.deepEqual(
            db().select().from(mediaVersions).all(),
            beforeVersions,
          );
          const job = db()
            .select()
            .from(mediaJobs)
            .where(eq(mediaJobs.id, reprocess.jobId))
            .get()!;
          assert.notEqual(job.status, 'succeeded');
          db()
            .update(mediaJobs)
            .set({ status: 'cancelled' })
            .where(eq(mediaJobs.id, reprocess.jobId))
            .run();
          return {
            forwarded,
            object: unknown,
            job,
            previousVersionsPreserved: true,
            injectedBoundary:
              'real service 200 dropped by local transport fault gateway',
          };
        } finally {
          db()
            .update(storageConfigs)
            .set({
              endpoint: target.endpoint,
              forcePathStyle: target.forcePathStyle,
            })
            .where(eq(storageConfigs.id, storageId))
            .run();
          const ended = once(proxy, 'close');
          proxy.closeAllConnections();
          proxy.close();
          await ended;
        }
      },
    );
    const upload = createSubmission(db(), {
      requestId: randomUUID(),
      storageId,
      files: [
        {
          queueItemId: randomUUID(),
          originalName: 'active.png',
          declaredSize: 16,
        },
      ],
    }).sessions[0];
    const uploadKey = `uploads/${upload.id}/active.png`;
    track(uploadKey);
    await save();
    await client.writeObject(uploadKey, Readable.from(['upload reference']), {
      size: 16,
      contentType: 'image/png',
      signal: AbortSignal.timeout(30000),
    });
    db()
      .update(uploadSessions)
      .set({ state: 'receiving', temporaryKey: uploadKey })
      .where(eq(uploadSessions.id, upload.id))
      .run();
    const uploadReferences = readUploadReferences(db());
    const writingJob = requestReprocess(db(), image.imageId, {
      scope: 'thumbnail',
    });
    assert.equal(claimNextMediaJob(db())!.id, writingJob.jobId);
    child = fork(
      fileURLToPath(import.meta.url),
      [
        '--worker',
        '--config',
        values.config!,
        '--service',
        target.service,
        '--db',
        databasePath,
        '--storage',
        storageId,
        '--job',
        writingJob.jobId,
      ],
      {
        env: {
          ...process.env,
          MEDIA_DELETE_TEST_KEY: encryptionKey.toString('hex'),
        },
        execArgv: process.execArgv,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    closed = once(child, 'exit');
    let errors = '';
    child.stderr!.on('data', (chunk) => {
      errors += String(chunk);
    });
    const messages: { checkpoint: string; key: string; objectId: string }[] =
      [];
    child.on('message', (message) => {
      messages.push(message as (typeof messages)[number]);
    });
    const waitCheckpoint = async (checkpoint: string) => {
      const deadline = Date.now() + 40000;
      while (!messages.some((message) => message.checkpoint === checkpoint)) {
        if (child!.exitCode !== null || Date.now() > deadline)
          throw new Error(`Writer did not reach ${checkpoint}: ${errors}`);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return messages.find((message) => message.checkpoint === checkpoint)!;
    };
    const planned = await waitCheckpoint('planned');
    track(planned.key);
    await save();
    await check(
      'real-PUT-unsettled-writer-and-delete-competition',
      async () => {
        const unknown = await waitCheckpoint('put-written-unsettled');
        assert.equal((await client.inspectObject(unknown.key))!.size, 16);
        assert.equal(
          db()
            .select()
            .from(mediaObjects)
            .where(eq(mediaObjects.id, unknown.objectId))
            .get()!.status,
          'writing',
        );
        trashImage(db(), image.imageId);
        const trash = await linkStatus(image.imageId);
        assert.equal(trash, 404);
        requestPermanentDelete(db(), image.imageId);
        const deleting = await linkStatus(image.imageId);
        assert.equal(deleting, 404);
        await cleanupPermanentDeletes(runtime(), new Set([image.imageId]));
        assert.equal(readMediaCleanup(db(), image.imageId).status, 'queued');
        assert.throws(
          () => completeMediaJob(db(), writingJob.jobId),
          /being deleted/,
        );
        child!.kill('SIGKILL');
        assert.deepEqual(await closed, [null, 'SIGKILL']);
        connection = openRuntimeDatabase(databasePath);
        recoverMediaJobs(db());
        recoverMediaCandidateCleanup(db());
        assert.equal(
          db()
            .select()
            .from(mediaJobs)
            .where(eq(mediaJobs.id, writingJob.jobId))
            .get()!.status,
          'cancelled',
        );
        return {
          checkpoint: unknown,
          trashLinkStatus: trash,
          deletingLinkStatus: deleting,
          cleanup: readMediaCleanup(db(), image.imageId),
          uploadReferences: readUploadReferences(db()),
        };
      },
    );
    await check(
      'partial-real-DELETE-and-injected-503-uses-two-attempts-across-restart',
      async () => {
        let failedDeletes = 0;
        const successes: string[] = [];
        const faults: string[] = [];
        const proxy = createServer(async (request, response) => {
          const prefix = `/${target.bucket}/ariso/${storageId}/`;
          const pathname = decodeURIComponent(
            new URL(request.url!, 'http://localhost').pathname,
          );
          if (!pathname.startsWith(prefix)) {
            response.writeHead(404);
            response.end();
            return;
          }
          const key = pathname.slice(prefix.length);
          try {
            if (request.method === 'HEAD') {
              const found = await client.inspectObject(key, {
                signal: AbortSignal.timeout(30000),
              });
              response.writeHead(
                found ? 200 : 404,
                found ? { 'content-length': String(found.size) } : {},
              );
              response.end();
            } else if (request.method === 'DELETE' && key === planned.key) {
              failedDeletes++;
              response.writeHead(503, { 'content-type': 'application/xml' });
              response.end(
                '<Error><Code>ServiceUnavailable</Code><Message>injected delete gateway outage</Message></Error>',
              );
            } else if (request.method === 'DELETE') {
              await client.deleteObject(key, {
                signal: AbortSignal.timeout(30000),
              });
              successes.push(key);
              response.writeHead(204);
              response.end();
            } else {
              response.writeHead(405);
              response.end();
            }
          } catch (error) {
            faults.push(error instanceof Error ? error.message : String(error));
            response.destroy();
          }
        });
        proxy.listen(0, '127.0.0.1');
        await once(proxy, 'listening');
        const address = proxy.address();
        assert.ok(address && typeof address !== 'string');
        db()
          .update(storageConfigs)
          .set({
            enabled: false,
            endpoint: `http://127.0.0.1:${address.port}`,
            forcePathStyle: true,
          })
          .where(eq(storageConfigs.id, storageId))
          .run();
        try {
          await cleanupPermanentDeletes(runtime(), new Set());
          const first = readMediaCleanup(db(), image.imageId);
          assert.equal(first.status, 'running');
          assert.equal(first.remaining.length, 1);
          assert.equal(first.remaining[0].key, planned.key);
          assert.equal(first.remaining[0].attempts, 1);
          const partialObjects = await listObjects();
          assert.deepEqual(
            partialObjects.map((object) => object.key).sort(),
            [planned.key, uploadKey]
              .map((key) => `ariso/${storageId}/${key}`)
              .sort(),
          );
          connection!.close();
          connection = openRuntimeDatabase(databasePath);
          recoverMediaJobs(db());
          recoverMediaCandidateCleanup(db());
          await cleanupPermanentDeletes(runtime(), new Set());
          assert.equal(failedDeletes, 1);
          db()
            .update(mediaObjects)
            .set({ nextCleanupAt: new Date(0) })
            .where(eq(mediaObjects.id, planned.objectId))
            .run();
          await cleanupPermanentDeletes(runtime(), new Set());
          const exhausted = readMediaCleanup(db(), image.imageId);
          assert.equal(exhausted.status, 'failed');
          assert.equal(exhausted.remaining[0].attempts, 2);
          assert.equal(failedDeletes, 2);
          connection!.close();
          connection = openRuntimeDatabase(databasePath);
          recoverMediaCandidateCleanup(db());
          await cleanupPermanentDeletes(runtime(), new Set());
          assert.equal(failedDeletes, 2);
          assert.deepEqual(faults, []);
          return {
            first,
            exhausted,
            actualSuccessfulDeletes: successes,
            failedDeletes,
            partialObjects,
            injection:
              'local gateway returns 503 for one exact candidate; other DELETE requests reach actual service',
          };
        } finally {
          db()
            .update(storageConfigs)
            .set({
              endpoint: target.endpoint,
              forcePathStyle: target.forcePathStyle,
            })
            .where(eq(storageConfigs.id, storageId))
            .run();
          const ended = once(proxy, 'close');
          proxy.closeAllConnections();
          proxy.close();
          await ended;
        }
      },
    );
    await check(
      'disabled-storage-clears-known-objects-and-releases-only-media-references',
      async () => {
        retryMediaCleanup(db(), image.imageId);
        db()
          .update(storageConfigs)
          .set({ enabled: false })
          .where(eq(storageConfigs.id, storageId))
          .run();
        await cleanupPermanentDeletes(runtime(), new Set());
        const result = readMediaCleanup(db(), image.imageId);
        assert.equal(result.status, 'succeeded');
        assert.deepEqual(result.remaining, []);
        for (const key of report.keys.filter((key) => key !== uploadKey))
          assert.equal(await client.inspectObject(key), null);
        assert.equal((await client.inspectObject(uploadKey))!.size, 16);
        assert.deepEqual(readUploadReferences(db()), uploadReferences);
        const references = db().transaction((tx) =>
          getStorageReferences(tx, storageId),
        );
        assert.deepEqual(references, {
          storageId,
          images: [],
          versions: [],
          objects: [],
          jobs: [],
          cleanupJobs: [],
        });
        const deleted = await linkStatus(image.imageId);
        assert.equal(deleted, 404);
        const actualObjects = await listObjects();
        assert.deepEqual(actualObjects, [
          { key: `ariso/${storageId}/${uploadKey}`, size: 16 },
        ]);
        return {
          result,
          references,
          uploadReferences: readUploadReferences(db()),
          deletedLinkStatus: deleted,
          actualObjects,
        };
      },
    );
    await check(
      'post-release-late-object-records-scanner-boundary',
      async () => {
        await client.writeObject(planned.key, Readable.from(['late object']), {
          size: 11,
          contentType: 'image/png',
          signal: AbortSignal.timeout(30000),
        });
        await cleanupPermanentDeletes(runtime(), new Set());
        const observed = await client.inspectObject(planned.key);
        assert.equal(observed!.size, 11);
        assert.deepEqual(
          db().transaction((tx) => getStorageReferences(tx, storageId)).objects,
          [],
        );
        assert.equal(readMediaCleanup(db(), image.imageId).status, 'succeeded');
        return {
          key: planned.key,
          observed,
          mediaReferences: [],
          scanner:
            'T-STO-06 not implemented; experiment finally deletes this exact key',
        };
      },
    );
    await check(
      'real-permission-failure-keeps-object-and-manual-cycle-recovers',
      async () => {
        db()
          .update(storageConfigs)
          .set({ enabled: true })
          .where(eq(storageConfigs.id, storageId))
          .run();
        const denied = await seed();
        db()
          .update(mediaJobs)
          .set({ status: 'succeeded' })
          .where(eq(mediaJobs.id, denied.jobId))
          .run();
        trashImage(db(), denied.imageId);
        requestPermanentDelete(db(), denied.imageId);
        db()
          .update(storageConfigs)
          .set({
            enabled: false,
            secretKeyEncrypted: secretCrypto.encryptSecret(
              'intentional-invalid-secret',
            ),
          })
          .where(eq(storageConfigs.id, storageId))
          .run();
        await cleanupPermanentDeletes(runtime(), new Set());
        const failure = readMediaCleanup(db(), denied.imageId);
        assert.equal(failure.status, 'failed');
        assert.equal(failure.remaining[0].attempts, 1);
        assert.match(
          failure.remaining[0].error!,
          /HTTP 403|SignatureDoesNotMatch|AccessDenied/,
        );
        await cleanupPermanentDeletes(runtime(), new Set());
        assert.equal(
          readMediaCleanup(db(), denied.imageId).remaining[0].attempts,
          1,
        );
        assert.ok(await client.inspectObject(failure.remaining[0].key));
        db()
          .update(storageConfigs)
          .set({
            secretKeyEncrypted: secretCrypto.encryptSecret(
              target.credentials.secretAccessKey,
            ),
          })
          .where(eq(storageConfigs.id, storageId))
          .run();
        retryMediaCleanup(db(), denied.imageId);
        await cleanupPermanentDeletes(runtime(), new Set());
        assert.equal(
          readMediaCleanup(db(), denied.imageId).status,
          'succeeded',
        );
        return {
          failure,
          recovered: readMediaCleanup(db(), denied.imageId),
          mediaReferences: db().transaction((tx) =>
            getStorageReferences(tx, storageId),
          ),
          uploadReferences: readUploadReferences(db()),
        };
      },
    );
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    if (!report.checks.some((check) => check.status === 'failed'))
      report.checks.push({
        name: 'runner',
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await closed;
    }
    for (const object of db().select().from(mediaObjects).all())
      track(object.key);
    await save();
    for (const key of report.keys) {
      try {
        await client.deleteObject(key, { signal: AbortSignal.timeout(30000) });
        assert.equal(
          await client.inspectObject(key, {
            signal: AbortSignal.timeout(30000),
          }),
          null,
        );
        report.cleanup.push({ key, status: 'absent' });
      } catch (error) {
        report.status = 'failed';
        report.cleanup.push({
          key,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await save();
    }
    try {
      report.finalObjects = await listObjects();
      assert.deepEqual(report.finalObjects, []);
    } catch (error) {
      report.status = 'failed';
      report.checks.push({
        name: 'final-namespace-object-list',
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    listClient.destroy();
    client.destroy();
    connection?.close();
    fixture.close();
    report.finishedAt = new Date().toISOString();
    await save();
  }
  return report.status === 'passed';
}
