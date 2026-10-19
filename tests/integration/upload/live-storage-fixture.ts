import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { mediaObjects } from '../../../src/server/media/schema.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { storageProbes } from '../../../src/server/storage/schema.ts';
import { readUploadReferences } from '../../../src/server/upload/usage.ts';
import { configSchema } from '../../experiments/storage-s3/config.ts';
import { publicUploadFixture } from './api-fixture.ts';

const fields = configSchema.shape;
const targetSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  endpoint: fields.endpoint,
  region: fields.region,
  bucket: fields.bucket,
  forcePathStyle: fields.forcePathStyle,
  credentials: fields.credentials,
});

type Fixture = Awaited<ReturnType<typeof publicUploadFixture>>;
type LiveUploadCheck = { name: string; detail: object };
type LiveUploadContext = {
  fixture: Fixture;
  storageId: string;
  client: ReturnType<typeof createS3Storage>;
  track: (key: string) => void;
  onCheck: (check: LiveUploadCheck) => Promise<void>;
};

/** Shared real-storage setup, persisted reporting and own-namespace cleanup. */
export async function runLiveUploadTarget(
  target: z.infer<typeof targetSchema>,
  output: string,
  options: {
    name: string;
    limits: string[];
    metadata?: Record<string, string>;
    verify: (context: LiveUploadContext) => Promise<void>;
  },
) {
  let fixture: Fixture | undefined;
  let client: ReturnType<typeof createS3Storage> | undefined;
  const report = {
    ...options.metadata,
    service: target.service,
    node: process.version,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    status: 'running' as 'running' | 'passed' | 'failed',
    storageId: null as string | null,
    checks: [] as {
      name: string;
      status: 'passed' | 'failed';
      detail: unknown;
    }[],
    keys: [] as string[],
    cleanup: [] as {
      key: string;
      result: 'absent' | 'failed';
      error?: string;
    }[],
    limits: options.limits,
  };
  const save = () =>
    writeFile(
      join(output, `${target.service}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  const track = (key: string) => {
    if (!report.keys.includes(key)) report.keys.push(key);
  };
  try {
    await save();
    fixture = await publicUploadFixture();
    const created = await fixture.ownerJson('/api/storages', 'POST', {
      type: 's3',
      name: options.name,
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
    const probe = await fixture.ownerJson(
      `/api/storages/${storage.id}/test`,
      'POST',
      {
        revision: storage.configRevision,
        wholeBucketHasNoLockRules: true,
      },
    );
    assert.equal(probe.status, 200);
    const result = await probe.json();
    assert.equal(result.passed, true, 'Real storage connection probe failed');
    assert.equal(result.cleanupPending, false);
    const enabled = await fixture.ownerJson(
      `/api/storages/${storage.id}`,
      'PATCH',
      { enabled: true },
    );
    assert.equal(enabled.status, 200);
    assert.equal((await enabled.json()).enabled, true);
    report.checks.push({
      name: 'real-s3-probe-and-enable',
      status: 'passed',
      detail: { storageId: storage.id, probeCleaned: true },
    });
    await save();
    await options.verify({
      fixture,
      storageId: storage.id,
      client,
      track,
      async onCheck(check) {
        report.checks.push({ ...check, status: 'passed' });
        await save();
      },
    });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.checks.push({
      name: 'runner',
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Snapshot tracked keys before closing the database; stop writers before remote cleanup.
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
          name: 'own-namespace-empty-after-cleanup',
          status: 'passed',
          detail: remaining,
        });
      } catch (error) {
        report.status = 'failed';
        report.checks.push({
          name: 'own-namespace-empty-after-cleanup',
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

export async function readLiveUploadTargets(defaultOutput: string) {
  assert.equal(process.versions.node.split('.')[0], '24');
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      output: { type: 'string', default: defaultOutput },
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
  return { targets, output };
}
