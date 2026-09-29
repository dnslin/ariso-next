import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { startStorageProbeRuntime } from '../../../src/server/storage/probe-runtime.ts';
import {
  readProbeReferences,
  readProbeUsage,
} from '../../../src/server/storage/probes.ts';
import {
  createStorage,
  readStorage,
  updateStorage,
} from '../../../src/server/storage/settings.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { storageCreateInputSchema } from '../../../src/server/storage/validation.ts';
import { configSchema, services } from './config.ts';

const targetSchema = z
  .object(configSchema.shape)
  .omit({ serviceVersion: true, revision: true, ownerConfirmation: true })
  .extend({
    serviceVersion: z.string().optional(),
    revision: z.string().optional(),
    ownerConfirmation: configSchema.shape.ownerConfirmation.optional(),
  });
assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    'r2-no-lock-evidence': { type: 'string' },
    output: { type: 'string', default: 'test-results/storage-probes' },
    service: { type: 'string' },
  },
});
const targets = values.config
  ? targetSchema
      .array()
      .parse(JSON.parse(await readFile(values.config, 'utf8')))
  : [];
const selected = values.service
  ? [z.enum(services).parse(values.service)]
  : (['r2', 'seaweedfs'] as const);
const outputRoot = resolve(values.output);
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'run-'));
const secrets = targets.flatMap((target) => Object.values(target.credentials));
const sanitize = (value: unknown) => {
  let result = JSON.stringify(value, null, 2);
  for (const secret of secrets)
    if (secret)
      result = result
        .replaceAll(secret, '[redacted]')
        .replaceAll(encodeURIComponent(secret), '[redacted]');
  return (
    result.replace(
      /https?:[^\s"<>]*X-Amz-[^\s"<>]*/gi,
      '[signed URL redacted]',
    ) + '\n'
  );
};
const failure = (error: unknown) => {
  const detail = error as {
    code?: string;
    serviceCode?: string;
    requestId?: string;
    httpStatusCode?: number;
  };
  return {
    message: error instanceof Error ? error.message : String(error),
    code: detail?.code,
    serviceCode: detail?.serviceCode,
    requestId: detail?.requestId,
    httpStatusCode: detail?.httpStatusCode,
  };
};

for (const service of selected) {
  const target = targets.find((item) => item.service === service);
  const noLockEvidence = target?.ownerConfirmation?.wholeBucketHasNoLockRules
    ? target.ownerConfirmation.evidence
    : values['r2-no-lock-evidence'];
  const report: Record<string, unknown> = {
    service,
    startedAt: new Date().toISOString(),
    status: 'incomplete',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    target: target && {
      endpoint: target.endpoint,
      region: target.region,
      bucket: target.bucket,
      forcePathStyle: target.forcePathStyle,
      serviceVersion:
        target.serviceVersion ??
        'Not supplied; response Server is recorded below',
    },
    noLockEvidence: service === 'r2' ? noLockEvidence : undefined,
    deploymentRequirement:
      'Private bucket and public aliases remain a deployment requirement; API denial does not verify unknown aliases',
  };
  const save = () =>
    writeFile(join(output, `${service}.json`), sanitize(report));
  if (!target || (service === 'r2' && !noLockEvidence)) {
    report.reason = !target
      ? 'No real-service configuration supplied; no remote requests attempted'
      : 'Missing R2 whole-bucket no-lock confirmation evidence; no remote requests attempted';
    await save();
    process.exitCode = 1;
    console.log(`${service}: incomplete; ${output}/${service}.json`);
    continue;
  }
  assert.ok(
    !target.credentials.sessionToken,
    'Production settings currently accept access/secret keys only',
  );
  const directory = await mkdtemp(join(tmpdir(), 'ariso-probes-157-'));
  const masterKey = randomBytes(32);
  await writeFile(join(directory, 'master.key'), masterKey, { mode: 0o600 });
  const secretCrypto = createSecretCrypto(masterKey);
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  const context = { secretCrypto, storageRoot: directory };
  let runtime: ReturnType<typeof startStorageProbeRuntime> | undefined;
  let verifier: ReturnType<typeof createS3Storage> | undefined;
  try {
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    const stored = createStorage(
      connection.db,
      storageCreateInputSchema.parse({
        type: 's3',
        name: `Issue 157 ${service}`,
        endpoint: target.endpoint,
        region: target.region,
        bucket: target.bucket,
        forcePathStyle: target.forcePathStyle,
        accessKey: target.credentials.accessKeyId,
        secretKey: target.credentials.secretAccessKey,
      }),
      context,
    );
    report.storageId = stored.id;
    report.database = join(directory, 'ariso.db');
    await save();
    const logs: unknown[] = [];
    runtime = startStorageProbeRuntime({
      db: connection.db,
      secretCrypto,
      logger: {
        info: (data: unknown) => {
          logs.push(data);
        },
        error: (data: unknown) => {
          logs.push(data);
        },
      },
    });
    report.logs = logs;
    assert.throws(
      () => updateStorage(connection.db, stored.id, { enabled: true }, context),
      { code: 'STORAGE_TEST_REQUIRED' },
    );
    const result = await runtime.test(stored.id, {
      revision: stored.configRevision,
      ...(service === 'r2'
        ? { wholeBucketHasNoLockRules: Boolean(noLockEvidence) }
        : {}),
    });
    report.connection = result;
    report.key = `ariso/${stored.id}/probes/${result.probeId}`;
    await save();
    assert.equal(result.passed, true);
    assert.deepEqual(
      result.stages.map((stage) => stage.status),
      Array(5).fill('passed'),
    );
    assert.equal(result.cleanupPending, false);
    assert.deepEqual(readProbeReferences(connection.db, stored.id), []);
    assert.deepEqual(readProbeUsage(connection.db), []);
    assert.equal(
      readStorage(connection.db, stored.id).connectionStatus,
      'passed',
    );
    assert.equal(readStorage(connection.db, stored.id).enabled, false);
    assert.equal(
      updateStorage(connection.db, stored.id, { enabled: true }, context)
        .enabled,
      true,
    );
    verifier = createS3Storage({
      ...target,
      id: stored.id,
      enabled: true,
      pathPrefix: '',
    });
    assert.equal(
      await verifier.inspectObject(`probes/${result.probeId}`, {
        signal: AbortSignal.timeout(30_000),
      }),
      null,
    );
    const signed = await verifier.signRead(`probes/${result.probeId}`, {
      method: 'HEAD',
    });
    const response = await fetch(signed.url, {
      method: 'HEAD',
      headers: { 'accept-encoding': 'identity' },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    report.exactKeyHead = {
      status: response.status,
      server: response.headers.get('server'),
      requestId: response.headers.get('x-amz-request-id'),
      cfRay: response.headers.get('cf-ray'),
    };
    await response.body?.cancel();
    assert.equal(response.status, 404);
    report.assertions = {
      stagesPassed: 5,
      enableBeforeTestRejected: true,
      enableAfterTestAllowed: true,
      referencesReleased: true,
      usageReleased: true,
      exactKeyAbsent: true,
    };
    const invalidSecret = `issue-157-invalid-${randomBytes(16).toString('hex')}`;
    secrets.push(invalidSecret);
    const changed = updateStorage(
      connection.db,
      stored.id,
      { secretKey: invalidSecret },
      context,
    );
    assert.equal(changed.enabled, false);
    assert.equal(changed.connectionStatus, 'untested');
    const rejected = await runtime.test(stored.id, {
      revision: changed.configRevision,
      ...(service === 'r2'
        ? { wholeBucketHasNoLockRules: Boolean(noLockEvidence) }
        : {}),
    });
    report.invalidCredentials = rejected;
    report.invalidCredentialsKey = `ariso/${stored.id}/probes/${rejected.probeId}`;
    report.pendingReferences = readProbeReferences(connection.db, stored.id);
    report.pendingUsage = readProbeUsage(connection.db);
    await save();
    assert.equal(rejected.passed, false);
    assert.equal(rejected.cleanupPending, true);
    assert.ok(
      rejected.stages.some((stage) => stage.error?.httpStatusCode === 403),
    );
    assert.equal(
      readStorage(connection.db, stored.id).connectionStatus,
      'failed',
    );
    assert.equal(readProbeReferences(connection.db, stored.id).length, 1);
    assert.throws(
      () => updateStorage(connection.db, stored.id, { enabled: true }, context),
      { code: 'STORAGE_TEST_REQUIRED' },
    );
    const restored = updateStorage(
      connection.db,
      stored.id,
      { secretKey: target.credentials.secretAccessKey },
      context,
    );
    await runtime.retryCleanup(stored.id, rejected.probeId);
    assert.equal(
      await verifier.inspectObject(`probes/${rejected.probeId}`, {
        signal: AbortSignal.timeout(30_000),
      }),
      null,
    );
    assert.deepEqual(readProbeReferences(connection.db, stored.id), []);
    assert.deepEqual(readProbeUsage(connection.db), []);
    assert.equal(
      readStorage(connection.db, stored.id).connectionStatus,
      'untested',
    );
    assert.throws(
      () => updateStorage(connection.db, stored.id, { enabled: true }, context),
      { code: 'STORAGE_TEST_REQUIRED' },
    );
    const retried = await runtime.test(stored.id, {
      revision: restored.configRevision,
      ...(service === 'r2'
        ? { wholeBucketHasNoLockRules: Boolean(noLockEvidence) }
        : {}),
    });
    report.retriedConnection = retried;
    report.retriedKey = `ariso/${stored.id}/probes/${retried.probeId}`;
    await save();
    assert.equal(retried.passed, true);
    assert.equal(
      await verifier.inspectObject(`probes/${retried.probeId}`, {
        signal: AbortSignal.timeout(30_000),
      }),
      null,
    );
    assert.deepEqual(readProbeReferences(connection.db, stored.id), []);
    assert.deepEqual(readProbeUsage(connection.db), []);
    assert.equal(
      updateStorage(connection.db, stored.id, { enabled: true }, context)
        .enabled,
      true,
    );
    report.recoveryAssertions = {
      credentialEditInvalidatesPassedResult: true,
      realServiceRejectedCredentials: true,
      failedCleanupRetainsExactKey: true,
      manualCleanupAfterCredentialRestorePassed: true,
      cleanupDoesNotRestoreConnectionPassed: true,
      newRevisionRequiresFullRetest: true,
      finalReferencesAndUsageReleased: true,
      recoveryKeysAbsent: true,
    };
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = failure(error);
  } finally {
    await runtime?.stop();
    verifier?.destroy();
    const references =
      typeof report.storageId === 'string'
        ? readProbeReferences(connection.db, report.storageId)
        : [];
    report.remainingReferences = references;
    connection.close();
    if (references.length === 0) {
      await rm(directory, { recursive: true, force: true });
      report.localDatabaseRemoved = true;
    } else
      report.cleanupResponsibility = `Retained independent SQLite and master.key in ${directory}; retry exact recorded keys using current credentials`;
    report.finishedAt = new Date().toISOString();
    await save();
  }
  if (report.status !== 'passed') process.exitCode = 1;
  console.log(`${service}: ${report.status}; ${output}/${service}.json`);
}
