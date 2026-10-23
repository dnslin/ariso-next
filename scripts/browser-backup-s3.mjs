import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { createS3Storage } from '../src/server/storage/s3.ts';
import { cleanupBackupScope, loadBackupS3Targets } from './verify-backup-s3.ts';
import {
  expectHttp,
  httpJson,
} from '../tests/integration/backup/production-fixture.ts';

export async function loadBackupBrowserProvider(file) {
  const providers = await loadBackupS3Targets([file]);
  assert.equal(
    providers.length,
    1,
    'The browser backup suite accepts exactly one provider',
  );
  return providers[0];
}

/** Owns only new random namespaces, including its own neighboring sentinel. */
export function createBackupBrowserS3(provider) {
  const base = `ariso-backup-browser/${randomUUID()}`;
  const scopes = [];
  const restoreTargets = [];
  const imageIds = [];
  const sentinelBytes = Buffer.from(
    'backup browser neighbor remains unchanged',
  );
  const report = {
    service: provider.service,
    scopes: [],
    sourceRemoval: [],
    cleanup: [],
    sentinelChecks: [],
  };
  let sentinel,
    sentinelWritten = false;
  function register(role, id, pathPrefix) {
    const storage = createS3Storage({
      ...provider,
      id,
      pathPrefix,
      enabled: true,
    });
    const scope = { role, id, pathPrefix, storage };
    scopes.push(scope);
    report.scopes.push({ role, id, pathPrefix });
    return scope;
  }
  async function checkSentinel(stage) {
    if (!sentinelWritten) return;
    const object = await sentinel.storage.readObjectForMaintenance(
      'sentinel.txt',
      { signal: AbortSignal.timeout(30000) },
    );
    assert.ok(
      (await buffer(object.stream)).equals(sentinelBytes),
      'Neighbor sentinel is unchanged',
    );
    report.sentinelChecks.push(stage);
  }
  return {
    report,
    restoreTargets,
    imageIds,
    async prepare({ source, bytes, token, albumId, tagId, signal }) {
      assert.equal(
        bytes.length,
        420,
        'This browser fixture uses only the existing 420-byte PNG',
      );
      sentinel = register('sentinel', randomUUID(), `${base}/neighbor`);
      await sentinel.storage.writeObject(
        'sentinel.txt',
        Readable.from([sentinelBytes]),
        { size: sentinelBytes.length, contentType: 'text/plain', signal },
      );
      sentinelWritten = true;
      for (const index of [0, 1]) {
        signal.throwIfAborted();
        const sourcePrefix = `${base}/source-${index}-${randomUUID()}`;
        const destinationPrefix = `${base}/destination-${index}-${randomUUID()}`;
        const created = await httpJson(
          await source.ownerJson('/api/storages', 'POST', {
            type: 's3',
            name: index ? 'S3 停用归档' : 'S3 默认图库',
            endpoint: provider.endpoint,
            region: provider.region,
            bucket: provider.bucket,
            pathPrefix: sourcePrefix,
            forcePathStyle: provider.forcePathStyle,
            accessKey: provider.credentials.accessKeyId,
            secretKey: provider.credentials.secretAccessKey,
          }),
          201,
          'Create browser source S3',
        );
        assert.ok(
          typeof created.id === 'string' && created.id,
          'Source S3 has a real storage ID',
        );
        register('source', created.id, sourcePrefix);
        register('destination', created.id, destinationPrefix);
        restoreTargets.push({
          storageId: created.id,
          confirmR2: provider.service === 'r2',
          value: {
            endpoint: provider.endpoint,
            region: provider.region,
            bucket: provider.bucket,
            pathPrefix: destinationPrefix,
            forcePathStyle: provider.forcePathStyle,
            accessKey: provider.credentials.accessKeyId,
            secretKey: provider.credentials.secretAccessKey,
          },
        });
        const tested = await httpJson(
          await source.ownerJson(`/api/storages/${created.id}/test`, 'POST', {
            revision: created.configRevision,
            ...(provider.service === 'r2'
              ? { wholeBucketHasNoLockRules: true }
              : {}),
          }),
          200,
          'Test browser source S3',
        );
        assert.equal(
          tested.passed,
          true,
          'Source S3 configuration passed its real probe',
        );
        await expectHttp(
          await source.ownerJson(`/api/storages/${created.id}`, 'PATCH', {
            enabled: true,
          }),
          200,
          'Enable browser source S3',
        );
        const form = new FormData();
        form.set('storageId', created.id);
        form.set('visibility', 'public');
        form.set(
          'file',
          new Blob([bytes], { type: 'image/png' }),
          `small-s3-${index}.png`,
        );
        const image = await httpJson(
          await source.request('/api/upload', {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: form,
          }),
          201,
          'Upload small browser S3 image',
        );
        assert.ok(image.imageId, 'Real S3 image identity returned');
        imageIds.push(image.imageId);
        await expectHttp(
          await source.ownerJson(
            `/api/images/${image.imageId}/collections`,
            'PATCH',
            { albumIds: [albumId], tagIds: [tagId] },
          ),
          200,
          'Attach S3 image relationships',
        );
      }
      await expectHttp(
        await source.ownerJson('/api/settings/storage', 'PATCH', {
          defaultStorageId: restoreTargets[0].storageId,
        }),
        200,
        'Set first S3 as source default',
      );
      await expectHttp(
        await source.ownerJson(
          `/api/storages/${restoreTargets[1].storageId}`,
          'PATCH',
          { enabled: false },
        ),
        200,
        'Disable second S3 after upload',
      );
      await checkSentinel('source-prepared');
    },
    async removeSource() {
      for (const scope of scopes.filter((item) => item.role === 'source')) {
        const removed = await cleanupBackupScope(scope.storage);
        assert.ok(
          removed > 0,
          'Original remote namespace contained saved images',
        );
        report.sourceRemoval.push({ id: scope.id, removed });
      }
      await checkSentinel('source-removed');
    },
    async verifyAfterRestore() {
      for (const scope of scopes.filter((item) => item.role === 'source')) {
        for await (const batch of scope.storage.listObjects({
          signal: AbortSignal.timeout(30000),
        }))
          assert.equal(
            batch.length,
            0,
            'Restore never writes back to the original S3',
          );
      }
      await checkSentinel('restored');
    },
    async close() {
      const errors = [];
      for (const scope of scopes.filter((item) => item.role !== 'sentinel')) {
        try {
          const removed = await cleanupBackupScope(scope.storage);
          report.cleanup.push({
            role: scope.role,
            id: scope.id,
            pathPrefix: scope.pathPrefix,
            removed,
            status: 'passed',
          });
        } catch (error) {
          errors.push(error);
          report.cleanup.push({
            role: scope.role,
            id: scope.id,
            pathPrefix: scope.pathPrefix,
            status: 'failed',
            error: String(error),
          });
        }
      }
      try {
        await checkSentinel('after-source-and-destination-cleanup');
      } catch (error) {
        errors.push(error);
        report.cleanup.push({
          role: 'sentinel',
          status: 'failed',
          phase: 'preservation-check',
          error: String(error),
        });
      }
      if (sentinel) {
        try {
          // Remove this test's single sentinel only after checking other cleanup left it intact.
          await sentinel.storage.deleteObject('sentinel.txt', {
            signal: AbortSignal.timeout(30000),
          });
          report.cleanup.push({
            role: 'sentinel',
            id: sentinel.id,
            pathPrefix: sentinel.pathPrefix,
            status: 'passed',
          });
        } catch (error) {
          errors.push(error);
          report.cleanup.push({
            role: 'sentinel',
            id: sentinel.id,
            pathPrefix: sentinel.pathPrefix,
            status: 'failed',
            error: String(error),
          });
        }
      }
      for (const scope of scopes) scope.storage.destroy();
      if (errors.length)
        throw new AggregateError(
          errors,
          'Remote browser fixture cleanup failed',
        );
    },
  };
}
