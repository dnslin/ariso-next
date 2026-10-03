import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { prepareImageDelivery } from '../../../src/server/delivery/response.ts';
import { processMediaJob } from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { startUploadRuntime } from '../../../src/server/upload/runtime.ts';
import {
  createSubmission,
  getSession,
} from '../../../src/server/upload/sessions.ts';
import {
  readUploadReferences,
  readUploadUsage,
} from '../../../src/server/upload/usage.ts';
import { collectionFixture } from '../collections/helpers.ts';
import { configSchema } from '../../experiments/storage-s3/config.ts';
import { uploadOrigin, uploadRequest } from './s3-fixture.ts';

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
type Check = { name: string; status: 'passed' | 'failed'; detail?: unknown };

async function runTarget(target: Target, output: string) {
  const local = collectionFixture();
  const temporaryRoot = join(dirname(local.storageRoot), 'tmp');
  await mkdir(temporaryRoot);
  const secretCrypto = createSecretCrypto(randomBytes(32));
  const storageId = `upload-162-${randomUUID()}`;
  const logger = createRuntimeLogger('upload.live', 'fatal');
  const context = {
    db: local.db,
    storageRoot: local.storageRoot,
    temporaryRoot,
    secretCrypto,
    logger,
  };
  const client = createS3Storage({
    ...target,
    id: storageId,
    enabled: true,
    pathPrefix: '',
  });
  const report = {
    service: target.service,
    endpoint: target.endpoint,
    bucket: target.bucket,
    storageId,
    databasePath: join(dirname(local.storageRoot), 'ariso.db'),
    node: process.version,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    status: 'running' as 'running' | 'passed' | 'failed',
    keys: [] as string[],
    checks: [] as Check[],
    cleanup: [] as {
      key: string;
      currentObject: 'absent' | 'failed';
      error?: string;
    }[],
    limits: [
      'Backend S3/direct/relay/media/delivery only; route fixtures seed current CORS status. Browser CORS is verified separately.',
      'No bucket policy/CORS changes, AWS service, container release or scanner validation.',
    ],
  };
  const reportPath = join(output, `${target.service}.json`);
  async function save() {
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  function track(key: string) {
    if (!report.keys.includes(key)) report.keys.push(key);
  }
  async function check(name: string, run: () => Promise<unknown>) {
    try {
      const detail = await run();
      report.checks.push({ name, status: 'passed', detail });
      await save();
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
  const now = new Date();
  local.db.transaction((tx) => {
    initializeSiteSettings(tx, {
      publicUrl: uploadOrigin,
      timeZone: 'Asia/Shanghai',
    });
    tx.insert(storageConfigs)
      .values({
        id: storageId,
        name: 'Issue 162 isolated live fixture',
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
        connectionStatus: 'passed',
        connectionRevision: 1,
        corsStatus: 'passed',
        corsRevision: 1,
        corsOrigin: uploadOrigin,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  const runtime = startUploadRuntime(context);
  const bytes = await readFile(
    resolve('tests/fixtures/runtime/images/sample.png'),
  );
  const submit = () =>
    createSubmission(local.db, {
      requestId: randomUUID(),
      storageId,
      files: [
        {
          queueItemId: randomUUID(),
          originalName: 'live.fake',
          declaredSize: bytes.length,
          declaredMime: 'application/octet-stream',
        },
      ],
    }).sessions[0];
  async function observeWriteRate() {
    // R2 limits writes to the same key; this pause is unrelated to late PUT cleanup.
    if (target.service === 'r2') await delay(1100);
  }
  async function originalBytes(imageId: string) {
    const result = await prepareImageDelivery(
      new Request(`${uploadOrigin}/i/${imageId}?type=original`),
      imageId,
      { ...context, readOwner: async () => true },
    );
    assert.equal(result.status, 302);
    const response = await fetch(result.headers.get('location')!, {
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    return Buffer.from(await response.arrayBuffer());
  }
  async function processAccepted(session: ReturnType<typeof getSession>) {
    const claimed = claimNextMediaJob(local.db);
    assert.equal(claimed?.id, session.jobId);
    await processMediaJob(context, session.jobId!, AbortSignal.timeout(120000));
    for (const object of local.db.select().from(mediaObjects).all())
      track(object.key);
    await save();
    const job = local.db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, session.jobId!))
      .get()!;
    const image = local.db
      .select()
      .from(mediaImages)
      .where(eq(mediaImages.id, session.imageId!))
      .get()!;
    assert.equal(
      job.status,
      'succeeded',
      job.error ?? 'Media job did not succeed',
    );
    assert.equal(image.processingStatus, 'ready');
    assert.ok(
      local.db
        .select()
        .from(mediaVersions)
        .where(eq(mediaVersions.imageId, image.id))
        .all()
        .some((version) => version.kind === 'thumbnail'),
    );
    assert.deepEqual(await originalBytes(image.id), bytes);
    return {
      imageId: image.id,
      jobId: job.id,
      processingStatus: image.processingStatus,
    };
  }
  try {
    await save();
    const first = submit();
    const begun = await runtime.begin(first.id, uploadOrigin);
    assert.equal(begun.route, 'direct');
    assert.ok('upload' in begun && begun.upload);
    const signed = begun.upload;
    const receiving = getSession(local.db, first.id);
    track(receiving.temporaryKey!);
    track(`original/${first.candidateImageId}.png`);
    await save();
    await check('direct-put-conditional-complete-idempotent', async () => {
      const response = await fetch(signed.url, {
        method: signed.method,
        headers: signed.headers,
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200);
      await observeWriteRate();
      const [a, b] = await Promise.all([
        runtime.complete(first.id),
        runtime.complete(first.id),
      ]);
      assert.equal(a.state, 'accepted');
      assert.equal(a.imageId, b.imageId);
      assert.equal((await runtime.complete(first.id)).imageId, a.imageId);
      assert.equal(
        await client.inspectObject(receiving.temporaryKey!, {
          signal: AbortSignal.timeout(30000),
        }),
        null,
      );
      assert.deepEqual(readUploadReferences(local.db), []);
      assert.deepEqual(readUploadUsage(local.db), []);
      return { imageId: a.imageId, jobId: a.jobId };
    });
    await check('direct-media-and-original-delivery', () =>
      processAccepted(getSession(local.db, first.id)),
    );
    await check('old-signed-put-does-not-replace-formal-original', async () => {
      const changed = Buffer.from(bytes);
      changed[changed.length - 1] ^= 1;
      await observeWriteRate();
      const response = await fetch(signed.url, {
        method: signed.method,
        headers: signed.headers,
        body: new Uint8Array(changed),
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await originalBytes(first.candidateImageId), bytes);
      return {
        lateTemporaryKey: receiving.temporaryKey,
        formalImageId: first.candidateImageId,
      };
    });
    const cancelled = submit();
    const cancellationBegin = await runtime.begin(cancelled.id, uploadOrigin);
    assert.ok('upload' in cancellationBegin && cancellationBegin.upload);
    const cancellationKey = getSession(local.db, cancelled.id).temporaryKey!;
    track(cancellationKey);
    await save();
    await check('cancel-and-late-complete-cannot-create-image', async () => {
      assert.equal((await runtime.cancel(cancelled.id)).state, 'cancelled');
      await observeWriteRate();
      const response = await fetch(cancellationBegin.upload.url, {
        method: cancellationBegin.upload.method,
        headers: cancellationBegin.upload.headers,
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200);
      await assert.rejects(runtime.complete(cancelled.id), {
        code: 'UPLOAD_STATE_CONFLICT',
      });
      assert.equal(
        local.db
          .select()
          .from(mediaImages)
          .where(eq(mediaImages.id, cancelled.candidateImageId))
          .get(),
        undefined,
      );
      return { sessionId: cancelled.id, lateKey: cancellationKey };
    });
    local.db
      .update(storageConfigs)
      .set({ corsStatus: 'failed' })
      .where(eq(storageConfigs.id, storageId))
      .run();
    const relayed = submit();
    track(`original/${relayed.candidateImageId}.png`);
    await save();
    await check('relay-receive-publish-and-transfer', async () => {
      const choice = await runtime.begin(relayed.id, uploadOrigin);
      assert.equal(choice.route, 'relay');
      assert.ok(choice.reason);
      const result = await runtime.receive(relayed.id, uploadRequest(bytes));
      assert.equal(result.state, 'accepted');
      assert.deepEqual(readUploadUsage(local.db), []);
      return {
        sessionId: relayed.id,
        imageId: result.imageId,
        reason: choice.reason,
      };
    });
    await check('relay-media-and-original-delivery', () =>
      processAccepted(getSession(local.db, relayed.id)),
    );
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    if (!report.checks.some((item) => item.status === 'failed'))
      report.checks.push({
        name: 'runner',
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
  } finally {
    await runtime.stop();
    for (const object of local.db.select().from(mediaObjects).all())
      track(object.key);
    for (const reference of readUploadReferences(local.db)) {
      if (reference.temporaryKey) track(reference.temporaryKey);
      if (reference.finalKey) track(reference.finalKey);
    }
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
        report.cleanup.push({ key, currentObject: 'absent' });
      } catch (error) {
        report.status = 'failed';
        report.cleanup.push({
          key,
          currentObject: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await save();
    }
    client.destroy();
    local.close();
    report.finishedAt = new Date().toISOString();
    await save();
  }
  return report.status === 'passed';
}

assert.equal(process.versions.node.split('.')[0], '24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/upload-162-live' },
    service: { type: 'string' },
  },
});
assert.ok(values.config, '--config must specify a private target file');
const targets = targetSchema
  .array()
  .parse(JSON.parse(await readFile(values.config, 'utf8')))
  .filter((target) => !values.service || target.service === values.service);
assert.ok(targets.length > 0);
const root = resolve(values.output!);
await mkdir(root, { recursive: true });
const output = await mkdtemp(join(root, 'run-'));
console.log(output);
let passed = true;
for (const target of targets)
  passed = (await runTarget(target, output)) && passed;
process.exitCode = passed ? 0 : 1;
