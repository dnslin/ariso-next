import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createS3Storage } from '../../../src/server/storage/s3.ts';

// Use the production adapter. Only the exact keys planned below may be deleted.
const targetSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  endpoint: z.url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().optional(),
  }),
});
type Target = z.infer<typeof targetSchema>;
type Check = { name: string; status: 'passed' | 'failed'; evidence: unknown };
type ServiceReport = {
  service: Target['service'];
  target: Omit<Target, 'credentials' | 'service'>;
  storageId: string;
  neighborStorageId: string;
  pathPrefix: string;
  plannedKeys: {
    storageId: string;
    key: string;
    remote: string;
    size: number;
  }[];
  status: 'running' | 'passed' | 'failed';
  checks: Check[];
};

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    output: { type: 'string', default: 'test-results/storage-listing.json' },
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
  scope: 'Namespace enumeration only; not the production orphan scanner',
  aws: 'Not tested; not required by the current service matrix',
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

function errorEvidence(error: unknown, target: Target) {
  const value = error as Error & {
    code?: string;
    serviceCode?: string;
    httpStatusCode?: number;
    requestId?: string;
    operation?: string;
    key?: string;
  };
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of Object.values(target.credentials)) {
    if (secret)
      message = message
        .replaceAll(secret, '[redacted]')
        .replaceAll(encodeURIComponent(secret), '[redacted]');
  }
  return {
    name: value?.name,
    message,
    code: value?.code,
    serviceCode: value?.serviceCode,
    httpStatusCode: value?.httpStatusCode,
    requestId: value?.requestId,
    operation: value?.operation,
    key: value?.key,
  };
}

async function verify(target: Target) {
  const id = `verify-164-${randomUUID()}`;
  const pathPrefix = 'verification-164 + %';
  const neighborId = `${id}-neighbor`;
  const initial = [
    { key: 'images/中文 + %2F?.bin', bytes: Buffer.from('分页中文') },
    { key: 'images/nested/second.bin', bytes: Buffer.from([1, 2, 3, 4, 5]) },
    { key: 'probes/zero', bytes: Buffer.alloc(0) },
    { key: 'uploads/session/inflight.partial', bytes: Buffer.alloc(127, 7) },
    { key: 'unexpected-orphan.bin', bytes: Buffer.alloc(1025, 13) },
  ];
  const late = { key: 'images/late-object.bin', bytes: Buffer.from('late') };
  const neighbor = {
    key: 'images/neighbor.bin',
    bytes: Buffer.from('neighbor'),
  };
  const { service, endpoint, region, bucket, forcePathStyle } = target;
  const result: ServiceReport = {
    service,
    target: { endpoint, region, bucket, forcePathStyle },
    storageId: id,
    neighborStorageId: neighborId,
    pathPrefix,
    plannedKeys: [
      ...[...initial, late].map(({ key, bytes }) => ({
        storageId: id,
        key,
        remote: `${pathPrefix}/ariso/${id}/${key}`,
        size: bytes.length,
      })),
      {
        storageId: neighborId,
        key: neighbor.key,
        remote: `${pathPrefix}/ariso/${neighborId}/${neighbor.key}`,
        size: neighbor.bytes.length,
      },
    ],
    status: 'running',
    checks: [],
  };
  report.services.push(result);
  // Persist cleanup ownership before any remote requests.
  await save();
  const storage = createS3Storage({ ...target, id, pathPrefix, enabled: true });
  const disabled = createS3Storage({
    ...target,
    id,
    pathPrefix,
    enabled: false,
  });
  const adjacent = createS3Storage({
    ...target,
    id: neighborId,
    pathPrefix,
    enabled: true,
  });
  const options = () => ({
    signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(120_000)]),
  });
  const list = async (adapter = disabled) =>
    Array.fromAsync(adapter.listObjects({ ...options(), batchSize: 2 }));
  const expected = (objects: typeof initial) =>
    objects
      .map(({ key, bytes }) => ({ key, size: bytes.length }))
      .sort((a, b) => a.key.localeCompare(b.key));
  const normalized = (batches: { key: string; size: number }[][]) =>
    batches.flat().sort((a, b) => a.key.localeCompare(b.key));
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
  const put = (adapter: typeof storage, item: (typeof initial)[number]) =>
    adapter.writeObject(item.key, Readable.from([item.bytes]), {
      ...options(),
      size: item.bytes.length,
      contentType: 'application/octet-stream',
    });
  try {
    await check('fresh-namespace-is-empty', async () => {
      assert.deepEqual(await list(), []);
      return { empty: true };
    });
    await check('write-exact-planned-keys', async () => {
      const writes = [];
      for (const item of initial)
        writes.push({ key: item.key, result: await put(storage, item) });
      writes.push({
        storageId: neighborId,
        key: neighbor.key,
        result: await put(adjacent, neighbor),
      });
      return writes;
    });
    await check(
      'disabled-pagination-size-and-namespace-isolation',
      async () => {
        const batches = await list();
        assert.equal(batches.length, 3);
        assert.ok(
          batches.every((batch) => batch.length > 0 && batch.length <= 2),
        );
        assert.deepEqual(normalized(batches), expected(initial));
        assert.deepEqual(normalized(await list(storage)), expected(initial));
        assert.equal(
          (await adjacent.inspectObject(neighbor.key, options()))?.size,
          neighbor.bytes.length,
        );
        return {
          batches,
          enabledAndDisabledMatch: true,
          neighborPreserved: true,
        };
      },
    );
    await check(
      'exact-key-delete-and-late-object-next-round-after-restart',
      async () => {
        for (const item of initial)
          await disabled.deleteObject(item.key, options());
        assert.deepEqual(await list(), []);
        await put(storage, late);
        const restarted = createS3Storage({
          ...target,
          id,
          pathPrefix,
          enabled: false,
        });
        try {
          const batches = await list(restarted);
          assert.deepEqual(normalized(batches), expected([late]));
          assert.equal(
            (await adjacent.inspectObject(neighbor.key, options()))?.size,
            neighbor.bytes.length,
          );
          return {
            batches,
            restartStartsFromBeginning: true,
            neighborPreserved: true,
          };
        } finally {
          restarted.destroy();
        }
      },
    );
  } catch {
    // The failed check remains in the report; all planned keys still get cleanup.
  } finally {
    for (const planned of result.plannedKeys) {
      try {
        await check(`cleanup:${planned.storageId}/${planned.key}`, async () => {
          const adapter = planned.storageId === id ? disabled : adjacent;
          const cleanup = { signal: AbortSignal.timeout(30_000) };
          const deleted = await adapter.deleteObject(planned.key, cleanup);
          assert.equal(await adapter.inspectObject(planned.key, cleanup), null);
          return { deleted, absent: true };
        });
      } catch {
        // Continue cleaning the other explicitly planned keys after a failure.
      }
    }
    try {
      await check('final-planned-namespaces-empty', async () => {
        for (const adapter of [disabled, adjacent])
          assert.deepEqual(
            await Array.fromAsync(
              adapter.listObjects({
                signal: AbortSignal.timeout(30_000),
                batchSize: 2,
              }),
            ),
            [],
          );
        return { namespaceEmpty: true, neighborNamespaceEmpty: true };
      });
    } catch {
      // Preserve any cleanup failure instead of claiming an empty namespace.
    }
    for (const adapter of [storage, disabled, adjacent]) adapter.destroy();
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
