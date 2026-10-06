import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { storageProbes } from '../../../src/server/storage/schema.ts';
import {
  readUploadReferences,
  readUploadUsage,
} from '../../../src/server/upload/usage.ts';
import { configSchema } from '../../experiments/storage-s3/config.ts';
import { publicUploadFixture, responseWithoutBody } from './api-fixture.ts';

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
  let fixture: Awaited<ReturnType<typeof publicUploadFixture>> | undefined;
  let client: ReturnType<typeof createS3Storage> | undefined;
  const report = {
    service: target.service,
    node: process.version,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    status: 'running' as 'running' | 'passed' | 'failed',
    storageId: null as string | null,
    checks: [] as Check[],
    keys: [] as string[],
    cleanup: [] as {
      key: string;
      result: 'absent' | 'failed';
      error?: string;
    }[],
    limits: [
      'Standalone HTTP upload, persisted jobs, authenticated original delivery and own namespace only.',
      'No bucket policy/CORS changes, AWS service, browser, container release or deployment.',
    ],
  };
  const path = join(output, `${target.service}.json`);
  const save = () => writeFile(path, JSON.stringify(report, null, 2) + '\n');
  const track = (key: string) => {
    if (!report.keys.includes(key)) report.keys.push(key);
  };
  async function check(name: string, operation: () => Promise<unknown>) {
    try {
      report.checks.push({ name, status: 'passed', detail: await operation() });
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
  async function originalBytes(imageId: string) {
    const delivered = await fixture!.owner(`/i/${imageId}?type=original`);
    assert.equal(delivered.status, 302);
    const response = await fetch(delivered.headers.get('location')!, {
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    return Buffer.from(await response.arrayBuffer());
  }
  try {
    await save();
    fixture = await publicUploadFixture();
    const { db } = fixture.connection;
    const token = await fixture.createToken();
    await check(
      'owner-creates-and-enables-isolated-real-s3-storage',
      async () => {
        const created = await fixture!.ownerJson('/api/storages', 'POST', {
          type: 's3',
          name: `Issue 167 ${target.service} isolated fixture`,
          endpoint: target.endpoint,
          region: target.region,
          bucket: target.bucket,
          forcePathStyle: target.forcePathStyle,
          pathPrefix: '',
          accessKey: target.credentials.accessKeyId,
          secretKey: target.credentials.secretAccessKey,
        });
        assert.equal(created.status, 201);
        const storage = await created.json();
        report.storageId = storage.id;
        client = createS3Storage({
          ...target,
          id: storage.id,
          enabled: true,
          pathPrefix: '',
        });
        const probe = await fixture!.ownerJson(
          `/api/storages/${storage.id}/test`,
          'POST',
          {
            revision: storage.configRevision,
            wholeBucketHasNoLockRules: true,
          },
        );
        assert.equal(probe.status, 200);
        const result = await probe.json();
        assert.equal(
          result.passed,
          true,
          'Real storage connection probe failed',
        );
        assert.equal(result.cleanupPending, false);
        const enabled = await fixture!.ownerJson(
          `/api/storages/${storage.id}`,
          'PATCH',
          { enabled: true },
        );
        assert.equal(enabled.status, 200);
        assert.equal((await enabled.json()).enabled, true);
        return {
          storageId: storage.id,
          connectionPassed: true,
          probeCleaned: true,
        };
      },
    );
    await check('unauthorized-is-rejected-before-body', async () => {
      const response = await responseWithoutBody(fixture!.origin, {});
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.imageId, null);
      assert.equal(body.status, 'not_created');
      assert.equal(body.error.stage, 'authentication');
      assert.equal(typeof body.requestId, 'string');
      return { status: response.status, stage: body.error.stage };
    });
    await check('invalid-fields-create-no-image-or-remote-object', async () => {
      const response = await fixture!.upload(
        token.key,
        fixture!.form([
          ['storageId', report.storageId!],
          ['visibility', 'public'],
          ['visibility', 'private'],
        ]),
      );
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.imageId, null);
      assert.equal(body.status, 'not_created');
      assert.equal(body.error.code, 'UPLOAD_DUPLICATE_FIELD');
      assert.equal(body.error.stage, 'receiving');
      assert.equal(db.select().from(mediaImages).all().length, 0);
      const objects: string[] = [];
      for await (const page of client!.listObjects({
        signal: AbortSignal.timeout(30000),
      }))
        objects.push(...page.map((object) => object.key));
      assert.deepEqual(objects, []);
      return { status: response.status, error: body.error, objects };
    });
    await check(
      'bearer-upload-waits-for-own-job-ready-and-actual-s3-versions',
      async () => {
        const response = await fixture!.upload(
          token.key,
          fixture!.form([
            ['storageId', report.storageId!],
            ['visibility', 'private'],
            ['tag', 'Issue 167 live'],
          ]),
        );
        assert.equal(response.status, 201, await response.clone().text());
        const body = await response.json();
        assert.equal(body.status, 'ready');
        assert.equal(body.processing.status, 'succeeded');
        const image = db
          .select()
          .from(mediaImages)
          .where(eq(mediaImages.id, body.imageId))
          .get()!;
        const job = db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.imageId, body.imageId))
          .get()!;
        assert.equal(image.processingStatus, 'ready');
        assert.equal(image.storageId, report.storageId);
        assert.equal(job.status, 'succeeded');
        const versions = db
          .select()
          .from(mediaVersions)
          .where(eq(mediaVersions.imageId, body.imageId))
          .all();
        assert.deepEqual(
          Object.keys(body.versions).sort(),
          versions.map((version) => version.kind).sort(),
        );
        assert.deepEqual(Object.keys(body.versions).sort(), [
          'compressed',
          'original',
          'thumbnail',
        ]);
        assert.deepEqual(await originalBytes(body.imageId), fixture!.bytes);
        for (const object of db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.imageId, body.imageId))
          .all()) {
          track(object.key);
          if (object.status === 'stored')
            assert.equal(
              (await client!.inspectObject(object.key))?.size,
              object.byteSize,
            );
        }
        assert.deepEqual(readUploadReferences(db), []);
        assert.deepEqual(readUploadUsage(db), []);
        const privateRead = await fixture!.request(
          `/i/${body.imageId}?type=original`,
          { headers: { authorization: `Bearer ${token.key}` } },
        );
        assert.equal(privateRead.status, 401);
        return {
          imageId: body.imageId,
          jobId: job.id,
          status: body.status,
          versions: Object.keys(body.versions).sort(),
          privateBearerStatus: privateRead.status,
          byteSize: fixture!.bytes.length,
        };
      },
    );
    await check(
      'processing-failure-preserves-real-image-original-and-earlier-versions',
      async () => {
        db.$client.exec(
          "CREATE TRIGGER fail_live_thumbnail BEFORE INSERT ON media_versions WHEN NEW.kind = 'thumbnail' BEGIN SELECT RAISE(ABORT, 'controlled live thumbnail publication failure'); END",
        );
        try {
          const response = await fixture!.upload(
            token.key,
            fixture!.form([['storageId', report.storageId!]]),
          );
          assert.equal(response.status, 422);
          const body = await response.json();
          assert.equal(body.status, 'failed');
          assert.equal(typeof body.imageId, 'string');
          assert.equal(body.error.stage, 'thumbnail');
          const image = db
            .select()
            .from(mediaImages)
            .where(eq(mediaImages.id, body.imageId))
            .get()!;
          const job = db
            .select()
            .from(mediaJobs)
            .where(eq(mediaJobs.imageId, body.imageId))
            .get()!;
          assert.equal(image.processingStatus, 'failed');
          assert.equal(job.status, 'failed');
          const versions = db
            .select()
            .from(mediaVersions)
            .where(eq(mediaVersions.imageId, body.imageId))
            .all();
          assert.deepEqual(versions.map((version) => version.kind).sort(), [
            'compressed',
            'original',
          ]);
          assert.deepEqual(await originalBytes(body.imageId), fixture!.bytes);
          return {
            imageId: image.id,
            jobId: job.id,
            status: body.status,
            stage: body.error.stage,
            versions: versions.map((version) => version.kind).sort(),
          };
        } finally {
          db.$client.exec('DROP TRIGGER fail_live_thumbnail');
        }
      },
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
    if (fixture) {
      for (const object of fixture.connection.db
        .select()
        .from(mediaObjects)
        .all())
        track(object.key);
      for (const reference of readUploadReferences(fixture.connection.db)) {
        if (reference.temporaryKey) track(reference.temporaryKey);
        if (reference.finalKey) track(reference.finalKey);
      }
      for (const probe of fixture.connection.db
        .select()
        .from(storageProbes)
        .all())
        track(probe.key);
      await fixture.close();
    }
    if (client) {
      try {
        for await (const page of client.listObjects({
          signal: AbortSignal.timeout(30000),
        }))
          for (const object of page) track(object.key);
      } catch (error) {
        report.status = 'failed';
        report.checks.push({
          name: 'list-own-namespace-for-cleanup',
          status: 'failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      for (const key of report.keys) {
        try {
          await client.deleteObject(key, {
            signal: AbortSignal.timeout(30000),
          });
          assert.equal(
            await client.inspectObject(key, {
              signal: AbortSignal.timeout(30000),
            }),
            null,
          );
          report.cleanup.push({ key, result: 'absent' });
        } catch (error) {
          report.status = 'failed';
          report.cleanup.push({
            key,
            result: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await save();
      }
      try {
        const remaining: string[] = [];
        for await (const page of client.listObjects({
          signal: AbortSignal.timeout(30000),
        }))
          remaining.push(...page.map((object) => object.key));
        assert.deepEqual(remaining, []);
        report.checks.push({
          name: 'own-namespace-is-empty-after-cleanup',
          status: 'passed',
          detail: remaining,
        });
      } catch (error) {
        report.status = 'failed';
        report.checks.push({
          name: 'own-namespace-is-empty-after-cleanup',
          status: 'failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      client.destroy();
    }
    report.finishedAt = new Date().toISOString();
    await save();
  }
  return report.status === 'passed';
}

assert.equal(process.versions.node.split('.')[0], '24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/upload-167-live' },
    service: { type: 'string' },
  },
});
assert.ok(
  values.config,
  '--config must specify the existing private target file',
);
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
