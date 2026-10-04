import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { acceptOriginal } from '../../../src/server/media/images.ts';
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
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { readStorageReferences } from '../../../src/server/startup/storage-references.ts';
import {
  readStorageOrphanUsage,
  startStorageMaintenance,
} from '../../../src/server/storage/maintenance.ts';
import { clientConfig } from '../../../src/server/storage/probes.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import {
  readStorageScan,
  scanStorage,
  type ScanContext,
} from '../../../src/server/storage/scans.ts';
import {
  storageConfigs,
  storageOrphans,
  storageProbes,
} from '../../../src/server/storage/schema.ts';
import {
  uploadSessions,
  uploadSubmissions,
} from '../../../src/server/upload/schema.ts';
import { releaseStorageHistory } from '../../../src/server/upload/usage.ts';

const targetSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  endpoint: z.url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }),
});
type Target = z.infer<typeof targetSchema>;
type Check = { name: string; status: 'passed' | 'failed'; evidence: unknown };
type ServiceReport = {
  service: Target['service'];
  storageId: string;
  neighborStorageId: string;
  pathPrefix: string;
  target: Omit<Target, 'credentials' | 'service'>;
  plannedKeys: {
    storageId: string;
    key: string;
    size: number;
    remote: string;
  }[];
  checks: Check[];
  status: 'running' | 'passed' | 'failed';
};
assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: {
      type: 'string',
      default: 'test-results/storage-maintenance.json',
    },
  },
});
assert.ok(values.config, 'Supply --config with R2 and SeaweedFS test targets');
const targets = targetSchema
  .array()
  .parse(JSON.parse(await readFile(values.config, 'utf8')));
assert.deepEqual(targets.map(({ service }) => service).sort(), [
  'r2',
  'seaweedfs',
]);
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  finishedAt: undefined as string | undefined,
  status: 'running',
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  scope:
    'Real scanStorage, maintenance startup recovery and configuration deletion against R2/SeaweedFS; private isolated SQLite reference fixtures',
  limitations: [
    'Application restart is simulated by stopping maintenance, reopening SQLite and starting maintenance again; no separate Web process was launched.',
    'The delete failure is injected once at the adapter boundary; it is not evidence of a real provider permission failure.',
    'Media/upload/probe rows are independent fixtures read by the production providers; this does not verify complete upload or image-processing workflows.',
    'AWS and release container architectures were not tested.',
  ],
  services: [] as ServiceReport[],
};
const save = async () => {
  await writeFile(`${output}.tmp`, JSON.stringify(report, null, 2) + '\n');
  await rename(`${output}.tmp`, output);
};
const interrupted = new AbortController();
const interrupt = () => interrupted.abort(new Error('Runner interrupted'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
function errorEvidence(cause: unknown, target: Target) {
  const error = cause as Error & {
    code?: string;
    operation?: string;
    key?: string;
    requestId?: string;
    httpStatusCode?: number;
  };
  let message = cause instanceof Error ? cause.message : String(cause);
  for (const secret of Object.values(target.credentials))
    message = message
      .replaceAll(secret, '[redacted]')
      .replaceAll(encodeURIComponent(secret), '[redacted]');
  return {
    message,
    code: error?.code,
    operation: error?.operation,
    key: error?.key,
    requestId: error?.requestId,
    httpStatusCode: error?.httpStatusCode,
  };
}

async function verify(target: Target) {
  const storageId = `maintenance-164-${randomUUID()}`;
  const neighborStorageId = `${storageId}-neighbor`;
  const pathPrefix = 'verification-164-maintenance + %';
  const protectedObjects = [
    {
      key: 'images/original 中文 + %2F?.bin',
      bytes: Buffer.from('protected original'),
    },
    { key: 'images/candidate.bin', bytes: Buffer.from('protected candidate') },
    {
      key: 'uploads/session/source.bin',
      bytes: Buffer.from('protected upload'),
    },
    { key: 'probes/registered', bytes: Buffer.from('protected probe') },
  ];
  const orphan = {
    key: 'unregistered/orphan.bin',
    bytes: Buffer.from('unknown orphan bytes'),
  };
  const late = {
    key: 'unregistered/late.bin',
    bytes: Buffer.from('late after stop'),
  };
  const neighbor = {
    key: 'images/neighbor.bin',
    bytes: Buffer.from('outside namespace'),
  };
  const { service, endpoint, region, bucket, forcePathStyle } = target;
  const result: ServiceReport = {
    service,
    storageId,
    neighborStorageId,
    pathPrefix,
    target: { endpoint, region, bucket, forcePathStyle },
    plannedKeys: [
      ...[...protectedObjects, orphan, late].map(({ key, bytes }) => ({
        storageId,
        key,
        size: bytes.length,
        remote: `${pathPrefix}/ariso/${storageId}/${key}`,
      })),
      {
        storageId: neighborStorageId,
        key: neighbor.key,
        size: neighbor.bytes.length,
        remote: `${pathPrefix}/ariso/${neighborStorageId}/${neighbor.key}`,
      },
    ],
    checks: [],
    status: 'running',
  };
  report.services.push(result);
  // All remote cleanup responsibilities are durable before the first request.
  await save();
  const directory = await mkdtemp(join(tmpdir(), 'ariso-real-maintenance-'));
  let connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  const secretCrypto = createSecretCrypto(randomBytes(32));
  let maintenance: ReturnType<typeof startStorageMaintenance> | undefined;
  const writer = createS3Storage({
    ...target,
    id: storageId,
    pathPrefix,
    enabled: true,
  });
  const adjacent = createS3Storage({
    ...target,
    id: neighborStorageId,
    pathPrefix,
    enabled: true,
  });
  const options = () => ({
    signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(120_000)]),
  });
  const list = (storage = writer) =>
    Array.fromAsync(storage.listObjects({ ...options(), batchSize: 2 }));
  const normalize = (batches: { key: string; size: number }[][]) =>
    batches.flat().sort((a, b) => a.key.localeCompare(b.key));
  const expected = (items: typeof protectedObjects) =>
    items
      .map(({ key, bytes }) => ({ key, size: bytes.length }))
      .sort((a, b) => a.key.localeCompare(b.key));
  const loggerErrors: unknown[] = [];
  const context = (): ScanContext => ({
    db: connection.db,
    storageRoot: directory,
    secretCrypto,
    readReferences: (db, id, key) => readStorageReferences(db, id, key, 0),
  });
  const start = () =>
    startStorageMaintenance({
      ...context(),
      clearReleasedReferences: releaseStorageHistory,
      logger: {
        error(value: unknown) {
          const err = (value as { err?: unknown }).err;
          loggerErrors.push(errorEvidence(err, target));
        },
      },
    });
  const check = async (name: string, action: () => Promise<unknown>) => {
    try {
      result.checks.push({ name, status: 'passed', evidence: await action() });
    } catch (error) {
      result.checks.push({
        name,
        status: 'failed',
        evidence: errorEvidence(error, target),
      });
      throw error;
    } finally {
      await save();
    }
  };
  const put = (
    storage: typeof writer,
    item: (typeof protectedObjects)[number],
  ) =>
    storage.writeObject(item.key, Readable.from([item.bytes]), {
      ...options(),
      size: item.bytes.length,
      contentType: 'application/octet-stream',
    });
  try {
    await check('isolated-sqlite-reference-fixtures', async () => {
      migrateRuntimeDatabase(connection.db, resolve('drizzle'));
      const now = new Date();
      connection.db
        .insert(storageConfigs)
        .values({
          id: storageId,
          name: 'isolated real maintenance',
          type: 's3',
          enabled: false,
          endpoint,
          region,
          bucket,
          forcePathStyle,
          pathPrefix,
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
      connection.db.transaction((tx) => {
        prepareInitialMedia(tx);
        const snapshot = createProcessingSnapshot(tx);
        const imageId = randomUUID();
        const accepted = acceptOriginal(tx, {
          imageId,
          storageId,
          originalName: 'fixture.bin',
          visibility: 'private',
          format: 'PNG',
          mime: 'image/png',
          byteSize: protectedObjects[0].bytes.length,
          key: protectedObjects[0].key,
          snapshot,
          expectedVersions: ['thumbnail'],
        });
        tx.insert(mediaObjects)
          .values({
            id: randomUUID(),
            imageId,
            storageId,
            jobId: accepted.jobId,
            key: protectedObjects[1].key,
            purpose: 'thumbnail',
            status: 'writing',
            byteSize: protectedObjects[1].bytes.length,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        const submissionId = randomUUID();
        tx.insert(uploadSubmissions)
          .values({
            id: submissionId,
            requestId: randomUUID(),
            requestInput: '{}',
            source: 'web',
            storageId,
            visibility: 'private',
            snapshot,
            albumIds: [],
            tagIds: [],
            maxFileBytes: 1024,
            batchSize: 1,
            queueLimit: 1,
            lastActivityAt: now,
            createdAt: now,
          })
          .run();
        tx.insert(uploadSessions)
          .values({
            id: randomUUID(),
            submissionId,
            queueItemId: 'fixture',
            groupIndex: 0,
            originalName: 'upload.bin',
            declaredSize: protectedObjects[2].bytes.length,
            storageId,
            state: 'receiving',
            candidateImageId: randomUUID(),
            temporaryKey: protectedObjects[2].key,
            temporaryBytes: protectedObjects[2].bytes.length,
            confirmedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        const probeId = randomUUID();
        tx.insert(storageProbes)
          .values({
            id: probeId,
            storageId,
            purpose: 'connection',
            configRevision: 1,
            key: protectedObjects[3].key,
            state: 'running',
            stage: 'verify',
            objectState: 'stored',
            byteSize: protectedObjects[3].bytes.length,
            confirmedAt: now,
            report: {
              probeId,
              storageId,
              revision: 1,
              passed: false,
              stale: false,
              cleanupPending: true,
              stages: [],
              deploymentRequirement: 'Private isolated fixture only',
              testedAt: now.toISOString(),
              ownerConfirmation: {
                wholeBucketHasNoLockRules: false,
                confirmedAt: null,
              },
            },
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });
      const refs = readStorageReferences(connection.db, storageId);
      assert.deepEqual(
        [...refs.keys].sort(),
        protectedObjects.map(({ key }) => key).sort(),
      );
      assert.equal(refs.counts.uploads, 1);
      assert.equal(refs.counts.objects, 2);
      assert.equal(refs.counts.probes, 1);
      return {
        counts: refs.counts,
        protectedKeys: [...refs.keys],
        configurationDisabled: true,
      };
    });
    await check('write-only-planned-keys', async () => {
      assert.deepEqual(await list(), []);
      const writes = [];
      for (const item of [...protectedObjects, orphan])
        writes.push({ key: item.key, result: await put(writer, item) });
      writes.push({
        storageId: neighborStorageId,
        key: neighbor.key,
        result: await put(adjacent, neighbor),
      });
      return { writes, batches: await list() };
    });
    await check(
      'real-list-injected-delete-failure-retains-known-usage',
      async () => {
        let injected = false;
        const scanContext = context();
        scanContext.adapterFactory = (config) => {
          const storage = createS3Storage(clientConfig(scanContext, config));
          return {
            listObjects: (settings) =>
              storage.listObjects({ ...settings, batchSize: 2 }),
            deleteObject: async (key, settings) => {
              if (key === orphan.key && !injected) {
                injected = true;
                throw Object.assign(
                  new Error('Intentional one-shot delete failure'),
                  { code: 'INJECTED_DELETE_FAILURE', operation: 'delete', key },
                );
              }
              return storage.deleteObject(key, settings);
            },
            destroy: () => storage.destroy(),
          };
        };
        await assert.rejects(
          () => scanStorage(scanContext, storageId, options()),
          { code: 'STORAGE_SCAN_FAILED' },
        );
        assert.ok(injected);
        const scan = readStorageScan(connection.db, storageId);
        assert.equal(scan?.failedCount, 1);
        const usage = readStorageOrphanUsage(scanContext, storageId);
        assert.equal(usage.knownBytes, orphan.bytes.length);
        assert.deepEqual(
          usage.objects.map(({ key }) => key),
          [orphan.key],
        );
        assert.deepEqual(
          normalize(await list()),
          expected([...protectedObjects, orphan]),
        );
        return { injectedFailure: true, scan, usage };
      },
    );
    await check(
      'next-real-scan-retries-and-protects-trash-candidate-upload-probe',
      async () => {
        connection.db
          .update(mediaImages)
          .set({ trashedAt: new Date() })
          .where(eq(mediaImages.storageId, storageId))
          .run();
        const scan = await scanStorage(context(), storageId, options());
        assert.equal(scan.deletedCount, 1);
        assert.deepEqual(normalize(await list()), expected(protectedObjects));
        assert.deepEqual(connection.db.select().from(storageOrphans).all(), []);
        assert.equal(
          (await adjacent.inspectObject(neighbor.key, options()))?.size,
          neighbor.bytes.length,
        );
        return {
          scan,
          remainingObjects: await list(),
          neighborPreserved: true,
          trashedOriginalPreserved: true,
        };
      },
    );
    await check(
      'maintenance-stop-reopen-start-cleans-unknown-late-object',
      async () => {
        maintenance = start();
        await maintenance.scan(storageId);
        await maintenance.stop();
        maintenance = undefined;
        await put(writer, late);
        assert.deepEqual(
          normalize(await list()),
          expected([...protectedObjects, late]),
        );
        connection.close();
        connection = openRuntimeDatabase(join(directory, 'ariso.db'));
        maintenance = start();
        await maintenance.scan(storageId);
        const scan = readStorageScan(connection.db, storageId);
        assert.equal(scan?.deletedCount, 1);
        assert.deepEqual(normalize(await list()), expected(protectedObjects));
        assert.deepEqual(connection.db.select().from(storageOrphans).all(), []);
        assert.equal(
          (await adjacent.inspectObject(neighbor.key, options()))?.size,
          neighbor.bytes.length,
        );
        return {
          scan,
          remainingObjects: await list(),
          reopenedDatabase: true,
          separateWebProcessRestart: false,
          neighborPreserved: true,
        };
      },
    );
    await check(
      'real-reference-deletion-boundary-and-empty-configuration-removal',
      async () => {
        await assert.rejects(() => maintenance!.deleteStorage(storageId), {
          code: 'STORAGE_IN_USE',
        });
        connection.db.transaction((tx) => {
          // Release only this test database's independently created fixtures.
          tx.delete(storageProbes)
            .where(eq(storageProbes.storageId, storageId))
            .run();
          tx.delete(uploadSessions)
            .where(eq(uploadSessions.storageId, storageId))
            .run();
          tx.delete(uploadSubmissions)
            .where(eq(uploadSubmissions.storageId, storageId))
            .run();
          tx.delete(mediaVersions).run();
          tx.delete(mediaObjects).run();
          tx.delete(mediaJobs).run();
          tx.delete(mediaImages).run();
        });
        const deleted = await maintenance!.deleteStorage(storageId);
        assert.equal(deleted.deleted, true);
        assert.equal(
          connection.db.select().from(storageConfigs).get(),
          undefined,
        );
        assert.equal(readStorageScan(connection.db, storageId), null);
        assert.deepEqual(await list(), []);
        assert.equal(
          (await adjacent.inspectObject(neighbor.key, options()))?.size,
          neighbor.bytes.length,
        );
        await assert.rejects(() => maintenance!.scan(storageId), {
          code: 'STORAGE_NOT_FOUND',
        });
        assert.deepEqual(loggerErrors, []);
        return {
          deleted,
          rejectedWhileReferenced: true,
          namespaceEmpty: true,
          deletedConfigurationNotScanned: true,
          neighborPreserved: true,
        };
      },
    );
  } catch {
    // Each failed check retains its diagnostic; cleanup still owns every planned key.
  } finally {
    if (maintenance) await maintenance.stop();
    for (const planned of result.plannedKeys) {
      try {
        await check(`cleanup:${planned.storageId}/${planned.key}`, async () => {
          const storage = planned.storageId === storageId ? writer : adjacent;
          const cleanup = { signal: AbortSignal.timeout(30_000) };
          const deleted = await storage.deleteObject(planned.key, cleanup);
          assert.equal(await storage.inspectObject(planned.key, cleanup), null);
          return { deleted, absent: true };
        });
      } catch {
        /* Continue every explicitly registered cleanup responsibility. */
      }
    }
    try {
      await check('final-both-planned-namespaces-empty', async () => {
        for (const storage of [writer, adjacent])
          assert.deepEqual(
            await Array.fromAsync(
              storage.listObjects({ signal: AbortSignal.timeout(30_000) }),
            ),
            [],
          );
        return { namespaceEmpty: true, neighborNamespaceEmpty: true };
      });
    } catch {
      /* The final listing failure remains visible in the report. */
    }
    writer.destroy();
    adjacent.destroy();
    connection.close();
    await rm(directory, { recursive: true, force: true });
    result.status = result.checks.some(({ status }) => status === 'failed')
      ? 'failed'
      : 'passed';
    await save();
  }
  console.log(`${service}: ${result.status}; ${output}`);
}
try {
  for (const target of targets) await verify(target);
} finally {
  report.status =
    report.services.length === 2 &&
    report.services.every(({ status }) => status === 'passed')
      ? 'passed'
      : 'failed';
  report.finishedAt = new Date().toISOString();
  await save();
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  if (report.status !== 'passed') process.exitCode = 1;
}
