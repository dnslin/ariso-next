import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  parseLibraryBatch,
  runLibraryBatch,
} from '../../../src/server/library/batch.ts';
import { readLibraryPage } from '../../../src/server/library/queries.ts';
import { parseLibraryQuery } from '../../../src/server/library/query-schema.ts';
import {
  cleanupPermanentDeletes,
  readMediaCleanup,
} from '../../../src/server/media/cleanup.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { stageError } from '../../../src/server/storage/probes.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
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
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'docs/verification/library-178/live' },
  },
});
assert.equal(process.versions.node.split('.')[0], '24');
assert.ok(values.config, '--config must specify a private target file');
const targets = targetSchema
  .array()
  .parse(JSON.parse(await readFile(values.config, 'utf8')));
assert.deepEqual(targets.map((target) => target.service).sort(), [
  'r2',
  'seaweedfs',
]);
await mkdir(resolve(values.output), { recursive: true });
const output = await mkdtemp(join(resolve(values.output), 'run-'));
console.log(output);
for (const target of targets)
  if (!(await runTarget(target))) process.exitCode = 1;

async function runTarget(target: Target) {
  const fixture = collectionFixture();
  const db = fixture.db;
  const storageId = `issue178-${randomUUID()}`;
  const imageId = randomUUID();
  const secretCrypto = createSecretCrypto(randomBytes(32));
  const client = createS3Storage({
    ...target,
    id: storageId,
    enabled: true,
    pathPrefix: '',
  });
  const keys = [`original/${imageId}.png`, `temporary/${imageId}.txt`];
  const secrets = Object.values(target.credentials);
  const report = {
    service: target.service,
    endpoint: target.endpoint,
    bucket: target.bucket,
    storageId,
    namespace: `ariso/${storageId}/`,
    imageId,
    keys,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    status: 'running' as 'running' | 'passed' | 'failed',
    checks: [] as {
      name: string;
      status: 'passed' | 'failed';
      detail: unknown;
    }[],
    diagnostics: [] as unknown[],
    finalObjects: [] as { key: string; size: number }[],
    cleanup: [] as {
      key: string;
      status: 'absent' | 'failed';
      rescueDeleteSent: boolean;
      error?: unknown;
    }[],
    limits: [
      'Only two explicitly registered real objects in a new isolated namespace per service; user configuration, bucket policy and user data are untouched.',
      'This validates production library batch orchestration and media cleanup against real services. It does not repeat Issue 163 processing, response-loss, permission, retry or interruption experiments.',
      'No UI, AWS, container, image publication, deployment or release validation. Historical object totals are unavailable after successful ledger removal.',
    ],
  };
  const save = () =>
    writeFile(
      join(output, `${target.service}.json`),
      JSON.stringify(report, null, 2) + '\n',
    );
  const runtime = {
    db,
    storageRoot: fixture.storageRoot,
    temporaryRoot: join(dirname(fixture.storageRoot), 'tmp'),
    secretCrypto,
    logger: {
      info() {},
      error(fields: unknown, message = '') {
        report.diagnostics.push({
          message,
          error: JSON.parse(
            JSON.stringify(fields, (_key, value) =>
              value instanceof Error ? stageError(value, secrets) : value,
            ),
          ),
        });
      },
    },
  };
  const batch = (mode: 'apply' | 'check') =>
    runLibraryBatch(
      db,
      parseLibraryBatch({
        ids: [imageId],
        query: 'scope=trash',
        command: { type: 'delete-permanent' },
        mode,
      }),
      (error) => {
        throw error;
      },
    );
  async function check(name: string, action: () => Promise<unknown>) {
    try {
      const detail = await action();
      report.checks.push({ name, status: 'passed', detail });
      await save();
      console.log(`${target.service}: ${name} passed`);
    } catch (error) {
      report.checks.push({
        name,
        status: 'failed',
        detail: stageError(error, secrets),
      });
      await save();
      throw error;
    }
  }
  async function listObjects() {
    const objects: typeof report.finalObjects = [];
    for await (const page of client.listObjects({
      signal: AbortSignal.timeout(30000),
    }))
      objects.push(...page);
    return objects.sort((first, second) => first.key.localeCompare(second.key));
  }
  await save();
  try {
    const now = new Date();
    db.insert(storageConfigs)
      .values({
        id: storageId,
        name: 'Issue 178 isolated fixture',
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
    const original = await readFile('tests/fixtures/runtime/images/sample.png');
    const temporary = Buffer.from('Issue 178 registered temporary object');
    db.insert(mediaImages)
      .values({
        id: imageId,
        storageId,
        originalName: 'issue-178.png',
        displayName: 'Issue 178 actual cleanup',
        visibility: 'private',
        format: 'PNG',
        mime: 'image/png',
        byteSize: original.length,
        processingStatus: 'ready',
        trashedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const objects = [
      {
        objectId: randomUUID(),
        key: keys[0],
        purpose: 'original' as const,
        bytes: original,
        mime: 'image/png',
      },
      {
        objectId: randomUUID(),
        key: keys[1],
        purpose: 'temporary' as const,
        bytes: temporary,
        mime: 'application/octet-stream',
      },
    ];
    for (const object of objects)
      db.insert(mediaObjects)
        .values({
          id: object.objectId,
          imageId,
          storageId,
          key: object.key,
          purpose: object.purpose,
          status: 'planned',
          byteSize: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    await check('registered-real-original-and-temporary-objects', async () => {
      for (const object of objects) {
        db.update(mediaObjects)
          .set({ status: 'writing', byteSize: null })
          .where(eq(mediaObjects.id, object.objectId))
          .run();
        await client.writeObject(object.key, Readable.from([object.bytes]), {
          size: object.bytes.length,
          contentType: object.mime,
          signal: AbortSignal.timeout(30000),
        });
        const head = await client.inspectObject(object.key, {
          signal: AbortSignal.timeout(30000),
        });
        assert.equal(head?.size, object.bytes.length);
        db.update(mediaObjects)
          .set({
            status: 'stored',
            byteSize: head.size,
            byteSizeConfirmedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mediaObjects.id, object.objectId))
          .run();
      }
      db.insert(mediaVersions)
        .values({
          imageId,
          kind: 'original',
          objectId: objects[0].objectId,
          byteSize: original.length,
          format: 'PNG',
          mime: 'image/png',
          createdAt: new Date(),
        })
        .run();
      const listed = await listObjects();
      assert.deepEqual(
        listed.map((object) => object.key).sort(),
        keys.slice().sort(),
      );
      return {
        objects: listed,
        registered: db.select().from(mediaObjects).all(),
      };
    });
    await check(
      'disabled-storage-batch-acceptance-keeps-real-record-and-counts',
      async () => {
        db.update(storageConfigs)
          .set({ enabled: false })
          .where(eq(storageConfigs.id, storageId))
          .run();
        const result = (await batch('apply')).results[0];
        assert.equal(result.status, 'accepted');
        assert.ok(result.cleanup);
        assert.equal(result.taskId, result.cleanup.jobId);
        assert.equal(result.cleanup.status, 'queued');
        assert.equal(result.cleanup.totalObjects, 2);
        assert.equal(result.cleanup.deletedObjects, 0);
        assert.equal(result.cleanup.remaining.length, 2);
        const record = db
          .select()
          .from(mediaImages)
          .where(eq(mediaImages.id, imageId))
          .get();
        assert.equal(record?.deletionStatus, 'deleting');
        const page = readLibraryPage(
          db,
          parseLibraryQuery(new URLSearchParams('scope=trash')),
        );
        assert.equal(page.total, 1);
        assert.equal(page.items[0].id, imageId);
        assert.equal(page.items[0].storage.enabled, false);
        assert.deepEqual(
          (await listObjects()).map((object) => object.key).sort(),
          keys.slice().sort(),
        );
        const duplicate = (await batch('apply')).results[0];
        assert.equal(duplicate.status, 'unchanged');
        assert.equal(duplicate.taskId, result.taskId);
        return {
          result,
          duplicate,
          recordRetained: Boolean(record),
          namespaceObjectsBeforeCleanup: await listObjects(),
        };
      },
    );
    await check(
      'production-cleanup-durable-success-and-empty-namespace',
      async () => {
        await cleanupPermanentDeletes(runtime, new Set());
        const durable = readMediaCleanup(db, imageId);
        assert.equal(durable.status, 'succeeded');
        assert.deepEqual(durable.remaining, []);
        assert.equal(durable.totalObjects, null);
        assert.equal(durable.deletedObjects, null);
        assert.equal(
          db
            .select()
            .from(mediaImages)
            .where(eq(mediaImages.id, imageId))
            .get(),
          undefined,
        );
        assert.deepEqual(db.select().from(mediaObjects).all(), []);
        const checked = (await batch('check')).results[0];
        assert.equal(checked.status, 'accepted');
        assert.equal(checked.taskId, durable.jobId);
        assert.equal(checked.cleanup?.status, 'succeeded');
        assert.equal(checked.inQuery, false);
        const heads = [];
        for (const key of keys) {
          const head = await client.inspectObject(key, {
            signal: AbortSignal.timeout(30000),
          });
          assert.equal(head, null);
          heads.push({ key, exists: false });
        }
        const listed = await listObjects();
        assert.deepEqual(listed, []);
        return {
          durable,
          checked,
          imageRemoved: true,
          heads,
          namespaceObjects: listed,
        };
      },
    );
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    if (!report.checks.some((item) => item.status === 'failed'))
      report.checks.push({
        name: 'runner',
        status: 'failed',
        detail: stageError(error, secrets),
      });
  } finally {
    for (const key of keys) {
      let rescueDeleteSent = false;
      try {
        if (
          await client.inspectObject(key, {
            signal: AbortSignal.timeout(30000),
          })
        ) {
          rescueDeleteSent = true;
          await client.deleteObject(key, {
            signal: AbortSignal.timeout(30000),
          });
        }
        assert.equal(
          await client.inspectObject(key, {
            signal: AbortSignal.timeout(30000),
          }),
          null,
        );
        report.cleanup.push({ key, status: 'absent', rescueDeleteSent });
      } catch (error) {
        report.status = 'failed';
        report.cleanup.push({
          key,
          status: 'failed',
          rescueDeleteSent,
          error: stageError(error, secrets),
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
        detail: stageError(error, secrets),
      });
    }
    client.destroy();
    fixture.close();
    report.finishedAt = new Date().toISOString();
    await save();
  }
  return report.status === 'passed';
}
