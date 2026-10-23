import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { createS3Storage } from '../src/server/storage/s3.ts';
import { s3EndpointSchema } from '../src/server/storage/validation.ts';
import { stageError } from '../src/server/storage/probes.ts';
import { publicUploadSuccessSchema } from '../src/server/upload/public-contract.ts';
import type { RestoreJob } from '../src/server/backup/types.ts';
import { RESTORE_CHUNK_BYTES } from '../src/server/backup/restore-upload.ts';
import {
  startBackupProductionInstance,
  requirePackagedBackupBuild,
  httpJson,
  expectHttp,
  waitUntil,
  waitForBackupJob,
  waitForRestoreJob,
  type BackupProductionInstance,
} from '../tests/integration/backup/production-fixture.ts';

const providerSchema = z.object({
  service: z.enum(['r2', 'seaweedfs']),
  serviceVersion: z.string().optional(),
  endpoint: s3EndpointSchema,
  region: z.string().min(1),
  bucket: z.string().min(1),
  forcePathStyle: z.boolean(),
  credentials: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }),
});
type Provider = z.infer<typeof providerSchema>;
type Scope = {
  role: 'source' | 'destination' | 'sentinel';
  id: string;
  pathPrefix: string;
  storage: ReturnType<typeof createS3Storage>;
};
export function parseBackupS3Args(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string', multiple: true },
      output: { type: 'string', default: 'test-results/backup-s3' },
    },
  });
  assert.ok(
    values.config?.length,
    'Supply at least one --config private provider file',
  );
  return { configs: values.config, output: values.output };
}
export async function loadBackupS3Targets(files: string[]) {
  const targets: Provider[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      throw new Error(`Cannot read valid provider configuration: ${file}`);
    }
    const result = z.array(providerSchema).nonempty().safeParse(parsed);
    assert.ok(result.success, `Provider configuration is incomplete: ${file}`);
    targets.push(...result.data);
  }
  assert.ok(
    new Set(targets.map((target) => target.service)).size === targets.length,
    'Supply each provider only once',
  );
  return targets;
}
export function backupVerificationPrefixes() {
  const base = `ariso-backup-verification/${randomUUID()}`;
  return {
    source: `${base}/source`,
    destination: `${base}/destination`,
    sentinel: `${base}/sentinel`,
  };
}
export async function cleanupBackupScope(
  storage: Pick<
    ReturnType<typeof createS3Storage>,
    'listObjects' | 'deleteObject'
  >,
) {
  let removed = 0;
  for await (const batch of storage.listObjects({
    signal: AbortSignal.timeout(30_000),
  }))
    for (const object of batch) {
      await storage.deleteObject(object.key, {
        signal: AbortSignal.timeout(30_000),
      });
      removed++;
    }
  for await (const batch of storage.listObjects({
    signal: AbortSignal.timeout(30_000),
  }))
    assert.ok(
      batch.length === 0,
      'Owned verification namespace still has objects after cleanup',
    );
  return removed;
}

function database<T>(
  instance: BackupProductionInstance,
  read: (db: Database.Database) => T,
) {
  const db = new Database(join(instance.dataDir, 'ariso.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return read(db);
  } finally {
    db.close();
  }
}
function retainedFacts(instance: BackupProductionInstance) {
  return database(instance, (db) => ({
    storages: db
      .prepare(
        'SELECT id,name,type,enabled,local_path FROM storage_configs ORDER BY id',
      )
      .all(),
    defaults: db
      .prepare('SELECT default_storage_id FROM storage_settings')
      .all(),
    owners: db.prepare('SELECT id,email FROM user ORDER BY id').all(),
    passwords: db
      .prepare(
        "SELECT account_id,user_id,password FROM account WHERE provider_id='credential' ORDER BY id",
      )
      .all(),
    uploadTokens: db
      .prepare('SELECT id,reference_id,key FROM apikey ORDER BY id')
      .all(),
    images: db
      .prepare(
        'SELECT id,storage_id,original_name,display_name,visibility FROM media_images ORDER BY id',
      )
      .all(),
    objects: db
      .prepare(
        "SELECT id,image_id,storage_id,key,purpose,byte_size,status FROM media_objects WHERE purpose!='temporary' ORDER BY id",
      )
      .all(),
    versions: db
      .prepare(
        'SELECT image_id,kind,object_id,byte_size FROM media_versions ORDER BY image_id,kind',
      )
      .all(),
    albums: db
      .prepare('SELECT id,name,description FROM albums ORDER BY id')
      .all(),
    tags: db
      .prepare('SELECT id,display_name,normalized_key FROM tags ORDER BY id')
      .all(),
    albumImages: db
      .prepare(
        'SELECT album_id,image_id,joined_at FROM album_images ORDER BY album_id,image_id',
      )
      .all(),
    imageTags: db
      .prepare(
        'SELECT image_id,tag_id FROM image_tags ORDER BY image_id,tag_id',
      )
      .all(),
  }));
}
type Version = {
  imageId: string;
  kind: string;
  storageId: string;
  key: string;
  bytes: number;
};
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
async function readHttpVersion(
  instance: BackupProductionInstance,
  version: Version,
) {
  let response = await instance.owner(
    `/i/${encodeURIComponent(version.imageId)}?type=${encodeURIComponent(version.kind)}`,
  );
  if (response.status === 302 || response.status === 307) {
    const location = response.headers.get('location');
    assert.ok(location, 'A redirected image must supply a download location');
    await response.arrayBuffer();
    response = await fetch(location, { signal: AbortSignal.timeout(30_000) });
  }
  await expectHttp(response, 200, `Read saved ${version.kind} image bytes`);
  return Buffer.from(await response.arrayBuffer());
}
async function readVersion(
  instance: BackupProductionInstance,
  version: Version,
  scopes: Scope[],
) {
  const remote = scopes.find((scope) => scope.id === version.storageId);
  if (!remote) return readHttpVersion(instance, version);
  const object = await remote.storage.readObjectForMaintenance(version.key, {
    signal: AbortSignal.timeout(30_000),
  });
  return buffer(object.stream);
}
function imageForm(bytes: Buffer, storageId: string, name: string) {
  const form = new FormData();
  form.set('storageId', storageId);
  form.set('visibility', 'public');
  form.set(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    name,
  );
  return form;
}
async function upload(
  instance: BackupProductionInstance,
  key: string,
  bytes: Buffer,
  storageId: string,
  name: string,
) {
  const value = await httpJson<unknown>(
    await instance.request('/api/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: imageForm(bytes, storageId, name),
      signal: AbortSignal.timeout(120_000),
    }),
    201,
    'Upload a small real PNG',
  );
  const parsed = publicUploadSuccessSchema.safeParse(value);
  assert.ok(
    parsed.success,
    'Small PNG upload must return the complete public success contract',
  );
  return parsed.data;
}

export async function verifyBackupS3Provider(
  provider: Provider,
  output: string,
) {
  const prefixes = backupVerificationPrefixes();
  const scopes: Scope[] = [];
  const instances: BackupProductionInstance[] = [];
  const secrets = [
    provider.credentials.accessKeyId,
    provider.credentials.secretAccessKey,
  ];
  const checks: string[] = [];
  const cleanup: {
    role: Scope['role'];
    id: string;
    pathPrefix: string;
    status: 'passed' | 'failed';
    removed?: number;
    error?: ReturnType<typeof stageError>;
  }[] = [];
  const report = {
    service: provider.service,
    serviceVersion: provider.serviceVersion ?? 'not-reported',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    status: 'failed',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    provider: {
      endpoint: provider.endpoint,
      region: provider.region,
      bucket: provider.bucket,
      forcePathStyle: provider.forcePathStyle,
    },
    application: requirePackagedBackupBuild(),
    prefixes,
    scopes: [] as { role: Scope['role']; id: string; pathPrefix: string }[],
    sample: { pngBytes: 0, sourceImages: 0, savedVersions: 0, backupBytes: 0 },
    sourceRemoval: [] as { storageId: string; removed: number }[],
    checks,
    cleanup,
    error: null as ReturnType<typeof stageError> | null,
  };
  const persist = () =>
    writeFile(
      join(output, `${provider.service}.json`),
      JSON.stringify(report, null, 2) + '\n',
      { mode: 0o600 },
    );
  function register(role: Scope['role'], id: string) {
    const pathPrefix = prefixes[role];
    const scope = {
      role,
      id,
      pathPrefix,
      storage: createS3Storage({ ...provider, id, pathPrefix, enabled: true }),
    };
    scopes.push(scope);
    report.scopes.push({ role, id, pathPrefix });
    return scope;
  }
  async function checkSentinel(scope: Scope) {
    const result = await scope.storage.readObjectForMaintenance(
      'sentinel.txt',
      { signal: AbortSignal.timeout(30_000) },
    );
    assert.ok(
      (await buffer(result.stream)).equals(
        Buffer.from('unrelated namespace stays unchanged'),
      ),
      'Neighbor namespace sentinel remains unchanged',
    );
  }
  try {
    await mkdir(output, { recursive: true, mode: 0o700 });
    const png = await readFile(
      resolve('tests/fixtures/media-formats/source.png'),
    );
    assert.ok(
      png.length < 64 * 1024,
      'Provider verification uses only the existing small PNG fixture',
    );
    report.sample.pngBytes = png.length;
    const source = await startBackupProductionInstance();
    instances.push(source);
    await source.initialize();
    await source.login();
    secrets.push(source.ownerCookie(), source.setupCode() ?? '');
    const storageRows = await httpJson<{ id: string; type: string }[]>(
      await source.owner('/api/storages'),
      200,
      'List source storage',
    );
    const localId = storageRows.find((storage) => storage.type === 'local')?.id;
    assert.ok(localId, 'Source has its default local storage');
    const remoteIds: string[] = [];
    for (const label of ['enabled', 'disabled']) {
      const created = await httpJson<{ id: string; configRevision: number }>(
        await source.ownerJson('/api/storages', 'POST', {
          name: `Backup ${provider.service} ${label}`,
          type: 's3',
          endpoint: provider.endpoint,
          region: provider.region,
          bucket: provider.bucket,
          pathPrefix: prefixes.source,
          forcePathStyle: provider.forcePathStyle,
          accessKey: provider.credentials.accessKeyId,
          secretKey: provider.credentials.secretAccessKey,
        }),
        201,
        'Create source S3 configuration',
      );
      remoteIds.push(created.id);
      register('source', created.id);
      await persist();
      const tested = await httpJson<{ passed: boolean }>(
        await source.ownerJson(`/api/storages/${created.id}/test`, 'POST', {
          revision: created.configRevision,
          ...(provider.service === 'r2'
            ? { wholeBucketHasNoLockRules: true }
            : {}),
        }),
        200,
        'Test source S3 current revision',
      );
      assert.ok(tested.passed, 'Source S3 connection/protection checks passed');
      await expectHttp(
        await source.ownerJson(`/api/storages/${created.id}`, 'PATCH', {
          enabled: true,
        }),
        200,
        'Enable tested source S3',
      );
    }
    await expectHttp(
      await source.ownerJson('/api/settings/media', 'PATCH', {
        watermarkMode: 'text',
        watermarkText: 'Backup',
        watermarkFont: 'latin',
      }),
      200,
      'Configure small saved watermark output',
    );
    const token = await httpJson<{ key: string }>(
      await source.ownerJson('/api/upload-tokens', 'POST', {
        name: 'S3 backup verification',
      }),
      200,
      'Create retained upload token',
    );
    secrets.push(token.key);
    const images = [];
    for (const [index, storageId] of [localId, ...remoteIds].entries())
      images.push(
        await upload(source, token.key, png, storageId, `small-${index}.png`),
      );
    report.sample.sourceImages = images.length;
    const album = await httpJson<{ album: { id: string } }>(
      await source.ownerJson('/api/albums', 'POST', {
        name: '备份验证相册',
        description: 'small mixed storage fixture',
      }),
      201,
      'Create source album',
    );
    const tag = await httpJson<{ tag: { id: string } }>(
      await source.ownerJson('/api/tags', 'POST', { name: '备份验证标签' }),
      201,
      'Create source tag',
    );
    for (const image of images)
      await expectHttp(
        await source.ownerJson(
          `/api/images/${image.imageId}/collections`,
          'PATCH',
          { albumIds: [album.album.id], tagIds: [tag.tag.id] },
        ),
        200,
        'Save source image relationships',
      );
    await expectHttp(
      await source.ownerJson('/api/settings/storage', 'PATCH', {
        defaultStorageId: remoteIds[0],
      }),
      200,
      'Retain S3 default selection',
    );
    await expectHttp(
      await source.ownerJson(`/api/storages/${remoteIds[1]}`, 'PATCH', {
        enabled: false,
      }),
      200,
      'Disable second S3 after saving its image',
    );
    const versions = database(
      source,
      (db) =>
        db
          .prepare(
            'SELECT v.image_id AS imageId,v.kind,o.storage_id AS storageId,o.key,v.byte_size AS bytes FROM media_versions v JOIN media_objects o ON o.id=v.object_id ORDER BY v.image_id,v.kind',
          )
          .all() as Version[],
    );
    assert.ok(
      versions.length >= images.length * 3,
      'All source images have saved original and derived versions',
    );
    report.sample.savedVersions = versions.length;
    const expected = new Map<string, string>();
    for (const version of versions) {
      const bytes = await readVersion(
        source,
        version,
        scopes.filter((scope) => scope.role === 'source'),
      );
      assert.ok(
        bytes.length === version.bytes,
        'Saved version has its confirmed byte size',
      );
      expected.set(`${version.imageId}:${version.kind}`, digest(bytes));
    }
    const originalFacts = retainedFacts(source);
    checks.push(
      'Three small real PNG uploads cover Local and two S3 configurations; one S3 is disabled with retained media',
    );
    const backupId = randomUUID();
    const backupPassword = randomUUID();
    secrets.push(backupPassword);
    await expectHttp(
      await source.ownerJson(`/api/backups/${backupId}`, 'PUT', {
        password: backupPassword,
      }),
      202,
      'Create encrypted mixed-storage backup',
    );
    await waitForBackupJob(source, backupId);
    const attachment = await expectHttp(
      await source.owner(`/api/backups/${backupId}/file`),
      200,
      'Download complete encrypted backup',
    );
    const archive = Buffer.from(await attachment.arrayBuffer());
    assert.ok(
      archive.subarray(0, 22).toString() === 'age-encryption.org/v1\n',
      'Downloaded file uses age encryption',
    );
    report.sample.backupBytes = archive.length;
    await source.removeData();
    for (const scope of scopes.filter((scope) => scope.role === 'source')) {
      const removed = await cleanupBackupScope(scope.storage);
      assert.ok(
        removed > 0,
        'Old S3 test namespace held actual saved objects before removal',
      );
      report.sourceRemoval.push({ storageId: scope.id, removed });
    }
    checks.push(
      'Source process stopped and DATA_DIR deleted; both original S3 test namespaces removed and checked empty',
    );
    const sentinel = register('sentinel', randomUUID());
    await persist();
    const sentinelBytes = Buffer.from('unrelated namespace stays unchanged');
    await sentinel.storage.writeObject(
      'sentinel.txt',
      Readable.from([sentinelBytes]),
      { size: sentinelBytes.length, contentType: 'text/plain' },
    );
    const destination = await startBackupProductionInstance();
    instances.push(destination);
    secrets.push(destination.setupCode() ?? '');
    const restoreId = randomUUID();
    const base = `/api/setup/restore/${restoreId}`;
    await expectHttp(
      await destination.restoreJson(base, 'PUT', {
        uploadBytes: archive.length,
      }),
      201,
      'Create empty-instance restore',
    );
    for (
      let offset = 0;
      offset < archive.length;
      offset += RESTORE_CHUNK_BYTES
    ) {
      const bytes = archive.subarray(
        offset,
        Math.min(offset + RESTORE_CHUNK_BYTES, archive.length),
      );
      await expectHttp(
        await destination.restore(`${base}/file`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Upload-Offset': String(offset),
            'Upload-Length': String(archive.length),
          },
          body: new Uint8Array(bytes),
        }),
        200,
        'Receive encrypted archive chunk',
      );
    }
    await expectHttp(
      await destination.restoreJson(`${base}/decryption`, 'POST', {
        password: backupPassword,
      }),
      202,
      'Decrypt received archive',
    );
    await waitForRestoreJob(destination, restoreId, 'configuring');
    await expectHttp(
      await destination.restoreJson(`${base}/site`, 'PUT', {
        publicUrl: destination.origin,
      }),
      200,
      'Save restored public URL',
    );
    for (const storageId of remoteIds) {
      register('destination', storageId);
      await persist();
      const saved = await httpJson<{ job: RestoreJob }>(
        await destination.restoreJson(`${base}/targets/${storageId}`, 'PUT', {
          endpoint: provider.endpoint,
          region: provider.region,
          bucket: provider.bucket,
          pathPrefix: prefixes.destination,
          forcePathStyle: provider.forcePathStyle,
          accessKey: provider.credentials.accessKeyId,
          secretKey: provider.credentials.secretAccessKey,
        }),
        200,
        'Save a fresh restore S3 target',
      );
      const current = saved.job.targets?.find(
        (target) => target.storageId === storageId,
      );
      assert.ok(current, 'Saved restore target exposes its current revision');
      await expectHttp(
        await destination.restoreJson(
          `${base}/targets/${storageId}/test`,
          'POST',
          {
            revision: current.revision,
            ...(provider.service === 'r2'
              ? { wholeBucketHasNoLockRules: true }
              : {}),
          },
        ),
        202,
        'Test restore target current revision',
      );
      await waitUntil(
        async () => {
          const { job } = await httpJson<{ job: RestoreJob }>(
            await destination.restore(base),
            200,
            'Read S3 target test result',
          );
          const target = job.targets?.find(
            (item) => item.storageId === storageId,
          );
          assert.ok(
            target?.testStatus !== 'failed',
            `Restore S3 test failed: ${target?.failure?.code ?? 'unknown'}`,
          );
          return target;
        },
        (target) =>
          target?.testStatus === 'passed' &&
          target.testedRevision === current.revision,
        'S3 target current revision passes',
        120_000,
      );
    }
    await expectHttp(
      await destination.restoreJson(`${base}/execution`, 'POST'),
      202,
      'Execute mixed-storage restore',
    );
    await waitForRestoreJob(destination, restoreId, 'ready');
    await checkSentinel(sentinel);
    await destination.restart();
    await destination.login();
    secrets.push(destination.ownerCookie());
    assert.ok(
      JSON.stringify(retainedFacts(destination)) ===
        JSON.stringify(originalFacts),
      'Restored IDs, keys, default/enabled state, password/token hashes and image/collection relationships match',
    );
    checks.push(
      'Restore uses new S3 namespaces and current tested revisions; explicit restart activates the original account with retained data identities',
    );
    for (const version of versions) {
      const bytes = await readVersion(
        destination,
        version,
        scopes.filter((scope) => scope.role === 'destination'),
      );
      assert.ok(
        bytes.length === version.bytes &&
          digest(bytes) === expected.get(`${version.imageId}:${version.kind}`),
        'Every restored Local/S3 version matches source bytes, including disabled S3',
      );
      if (version.storageId !== remoteIds[1])
        assert.ok(
          digest(await readHttpVersion(destination, version)) ===
            expected.get(`${version.imageId}:${version.kind}`),
          'Enabled restored media is available through its existing HTTP link',
        );
    }
    await upload(destination, token.key, png, localId, 'token-still-valid.png');
    await checkSentinel(sentinel);
    for (const scope of scopes.filter((scope) => scope.role === 'source'))
      assert.ok(
        (await cleanupBackupScope(scope.storage)) === 0,
        'Restore did not recreate or depend on the old S3 namespace',
      );
    checks.push(
      'All saved version bytes and retained upload token verified; unrelated sentinel unchanged and old S3 namespaces remain empty',
    );
    report.status = 'passed';
  } catch (error) {
    report.error = stageError(error, secrets.filter(Boolean));
  } finally {
    for (const instance of instances)
      try {
        await instance.stop();
      } catch (error) {
        report.status = 'failed';
        report.error ??= stageError(error, secrets.filter(Boolean));
      }
    for (const scope of scopes) {
      const identity = {
        role: scope.role,
        id: scope.id,
        pathPrefix: scope.pathPrefix,
      };
      try {
        cleanup.push({
          ...identity,
          status: 'passed',
          removed: await cleanupBackupScope(scope.storage),
        });
      } catch (error) {
        cleanup.push({
          ...identity,
          status: 'failed',
          error: stageError(error, secrets.filter(Boolean)),
        });
        report.status = 'failed';
      } finally {
        scope.storage.destroy();
      }
    }
    for (const instance of instances)
      try {
        await instance.close();
      } catch (error) {
        report.status = 'failed';
        report.error ??= stageError(error, secrets.filter(Boolean));
      }
    report.finishedAt = new Date().toISOString();
    await persist();
  }
  return report;
}

export async function main(args = process.argv.slice(2)) {
  assert.ok(process.versions.node.split('.')[0] === '24', 'Use Node 24');
  const options = parseBackupS3Args(args);
  const targets = await loadBackupS3Targets(options.configs);
  requirePackagedBackupBuild();
  const output = resolve(options.output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const reports = [];
  for (const provider of targets) {
    const report = await verifyBackupS3Provider(provider, output);
    reports.push(report);
    process.stdout.write(
      `${provider.service}: ${report.status}; ${report.checks.length} checks; cleanup ${report.cleanup.every((item) => item.status === 'passed') ? 'passed' : 'failed'}\n`,
    );
  }
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify(reports, null, 2) + '\n',
    { mode: 0o600 },
  );
  if (reports.some((report) => report.status !== 'passed'))
    process.exitCode = 1;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await main();
