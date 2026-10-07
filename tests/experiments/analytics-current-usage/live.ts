import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../storage-s3/config.ts';
import { createClient, errorEvidence } from '../storage-s3/protocol.ts';
import { put } from '../upload-late-put/transport.ts';
import {
  deleteSampleObject,
  inspectSampleObject,
  listSampleObjects,
} from '../analytics-usage/remote.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { readUsage } from '../../../src/server/analytics/usage.ts';
import { prepareInitialMedia } from '../../../src/server/media/settings.ts';
import {
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { trashImage, restoreImage } from '../../../src/server/media/trash.ts';
import { requestPermanentDelete } from '../../../src/server/media/cleanup.ts';
import { createSubmission } from '../../../src/server/upload/sessions.ts';
import { acceptSession } from '../../../src/server/upload/accept.ts';
import { uploadSessions } from '../../../src/server/upload/schema.ts';
import {
  storageConfigs,
  storageOrphans,
  storageProbes,
} from '../../../src/server/storage/schema.ts';
import { scanStorage } from '../../../src/server/storage/scans.ts';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
import { readStorageReferences } from '../../../src/server/startup/storage-references.ts';

export type Target = Pick<
  StorageConfig,
  | 'service'
  | 'endpoint'
  | 'region'
  | 'bucket'
  | 'forcePathStyle'
  | 'credentials'
>;

/** Real remote objects and production providers. Scanner failure is explicitly injected once. */
export async function runCurrentUsageService(
  config: Target,
  directory: string,
) {
  await mkdir(directory, { recursive: true });
  const storageId = `analytics-168-${randomUUID()}`;
  const prefix = `ariso/${storageId}/`;
  const names = [
    'original',
    'temporary',
    'thumbnail',
    'candidate',
    'old',
    'probe',
    'late',
  ];
  const keys = Object.fromEntries(names.map((name) => [name, `${name}.bin`]));
  const attempted = new Set<string>();
  const bytes = new Map<string, number>();
  const report = {
    service: config.service,
    endpoint: config.endpoint,
    bucket: config.bucket,
    startedAt: new Date().toISOString(),
    storageId,
    prefix,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    status: 'running',
    boundary:
      'Real PUT/HEAD/LIST/DELETE; production SQLite schema, readUsage, acceptSession, trash/restore and scanner. Provider mutations use observed HEAD sizes. Media processing and the upload receiver are not exercised. One scanner DELETE failure is deliberately injected to inspect retained orphan responsibility before a real retry. Registered usage is not a remote realtime total.',
    observations: [] as { name: string; at: string; evidence: unknown }[],
    cleanup: [] as { key: string; result?: unknown; error?: unknown }[],
  };
  const save = () =>
    writeFile(
      join(directory, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  // Setup belongs inside try/finally so failed migration/report I/O cannot leak handles.
  let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
  let client: ReturnType<typeof createClient> | undefined;
  let inFlight: ReturnType<typeof put> | undefined;
  try {
    connection = openRuntimeDatabase(join(directory, 'usage.sqlite'));
    const { db } = connection;
    migrateRuntimeDatabase(db, resolve('drizzle'));
    client = createClient(config);
    const now = new Date();
    db.insert(storageConfigs)
      .values({
        id: storageId,
        name: config.service,
        type: 's3',
        enabled: true,
        endpoint: config.endpoint,
        region: config.region,
        bucket: config.bucket,
        pathPrefix: '',
        forcePathStyle: config.forcePathStyle,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.transaction((tx) => prepareInitialMedia(tx));
    const usage = () =>
      readUsage(db).storages.find((storage) => storage.id === storageId)!;
    function expectUsage(
      original: number,
      derived: number,
      pending: number,
      recycle = 0,
      unconfirmedObjects = 0,
    ) {
      assert.deepEqual(usage().groups, { original, derived, pending, recycle });
      assert.equal(usage().knownBytes, original + derived + pending + recycle);
      assert.equal(usage().unconfirmedObjects, unconfirmedObjects);
    }
    async function observe(
      name: string,
      protocol: unknown = {},
      unregistered: string[] = [],
    ) {
      const listed = await listSampleObjects(client!, config.bucket, prefix);
      const media = db.select().from(mediaObjects).all();
      const upload = db
        .select({
          id: uploadSessions.id,
          state: uploadSessions.state,
          temporaryKey: uploadSessions.temporaryKey,
          temporaryBytes: uploadSessions.temporaryBytes,
          finalKey: uploadSessions.finalKey,
          finalBytes: uploadSessions.finalBytes,
          cleanupStatus: uploadSessions.cleanupStatus,
        })
        .from(uploadSessions)
        .all();
      const probes = db
        .select({
          key: storageProbes.key,
          objectState: storageProbes.objectState,
          byteSize: storageProbes.byteSize,
        })
        .from(storageProbes)
        .all();
      const orphans = db.select().from(storageOrphans).all();
      // Verify each physical identity independently, so equal sums cannot hide
      // a wrong key or swapped byte counts. Later providers overwrite observations.
      const owned = new Map<string, { owner: string; bytes: number | null }>();
      for (const item of orphans)
        owned.set(item.key, { owner: 'storage-orphan', bytes: item.size });
      for (const item of probes)
        if (item.objectState !== 'planned')
          owned.set(item.key, {
            owner: 'storage-probe',
            bytes: item.objectState === 'writing' ? null : item.byteSize,
          });
      for (const item of upload) {
        if (item.temporaryKey)
          owned.set(item.temporaryKey, {
            owner: 'upload',
            bytes: item.temporaryBytes,
          });
        if (item.finalKey && item.state !== 'accepted')
          owned.set(item.finalKey, { owner: 'upload', bytes: item.finalBytes });
      }
      for (const item of media)
        if (item.status !== 'deleted' && item.status !== 'planned')
          owned.set(item.key, {
            owner: 'media',
            bytes: item.status === 'writing' ? null : item.byteSize,
          });
      const remote = new Map(
        listed.map((item) => [item.key.slice(prefix.length), item.bytes]),
      );
      const objectReconciliation = [...owned].map(([key, item]) => {
        if (item.bytes !== null)
          assert.equal(
            remote.get(key),
            item.bytes,
            `${name}: ${key} differs from owner ${item.owner}`,
          );
        return { key, ...item, remoteBytes: remote.get(key) ?? null };
      });
      for (const key of remote.keys())
        assert.ok(
          owned.has(key) || unregistered.includes(key),
          `${name}: unexpected unregistered object ${key}`,
        );
      const registeredBytes = listed
        .filter((item) => !unregistered.includes(item.key.slice(prefix.length)))
        .reduce((total, item) => {
          assert.notEqual(item.bytes, null);
          return total + item.bytes!;
        }, 0);
      assert.equal(
        usage().knownBytes,
        registeredBytes,
        `${name}: registered usage differs from remote exact-object inventory`,
      );
      report.observations.push({
        name,
        at: new Date().toISOString(),
        evidence: {
          protocol,
          remoteObjects: listed,
          objectReconciliation,
          intentionallyUnregistered: unregistered,
          usage: usage(),
          media,
          upload,
          probes,
          orphans,
        },
      });
      await save();
    }
    async function write(name: string, size: number) {
      const key = keys[name];
      attempted.add(key); // A failed PUT can still have written the remote object.
      await client!.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: prefix + key,
          Body: Buffer.alloc(size),
        }),
      );
      const head = await inspectSampleObject(
        client!,
        config.bucket,
        prefix + key,
      );
      assert.equal(head.exists, true);
      assert.equal(head.bytes, size);
      bytes.set(name, head.bytes!);
      return head;
    }
    const b = (name: string) => {
      const size = bytes.get(name);
      assert.notEqual(size, undefined);
      return size!;
    };
    async function remove(name: string) {
      return deleteSampleObject(client!, config.bucket, prefix + keys[name]);
    }
    await save();
    const session = createSubmission(db, {
      storageId,
      requestId: randomUUID(),
      files: [
        { queueItemId: 'one', originalName: 'sample.png', declaredSize: 1024 },
      ],
    }).sessions[0];
    db.update(uploadSessions)
      .set({
        state: 'finalizing',
        route: 'direct',
        finalKey: keys.original,
        temporaryKey: keys.temporary,
      })
      .where(eq(uploadSessions.id, session.id))
      .run();
    expectUsage(0, 0, 0, 0, 2);
    await observe('writing-unknown');
    await write('original', 1024);
    await write('temporary', 2048);
    db.update(uploadSessions)
      .set({
        finalBytes: b('original'),
        byteSize: b('original'),
        temporaryBytes: b('temporary'),
        confirmedAt: new Date(),
      })
      .where(eq(uploadSessions.id, session.id))
      .run();
    expectUsage(0, 0, b('original') + b('temporary'));
    await observe('upload-confirmed');
    const facts: Parameters<typeof acceptSession>[2] = {
      format: 'PNG',
      mime: 'image/png',
      extension: 'png',
      coder: 'png',
      width: 1,
      height: 1,
    };
    db.$client.exec(
      "CREATE TRIGGER fail_handoff BEFORE UPDATE OF state ON upload_sessions WHEN NEW.state='accepted' BEGIN SELECT RAISE(ABORT,'injected handoff failure'); END",
    );
    assert.throws(
      () => acceptSession(db, session.id, facts),
      /injected handoff failure/,
    );
    assert.equal(db.select().from(mediaObjects).all().length, 0);
    await observe('handoff-rollback');
    db.$client.exec('DROP TRIGGER fail_handoff');
    const accepted = acceptSession(db, session.id, facts);
    assert.ok(accepted.imageId);
    const imageId = accepted.imageId;
    expectUsage(b('original'), 0, b('temporary'));
    await observe('handoff-retained-temporary');
    for (const [name, size] of [
      ['thumbnail', 512],
      ['candidate', 256],
      ['old', 128],
    ] as const) {
      await write(name, size);
      const id = randomUUID();
      db.insert(mediaObjects)
        .values({
          id,
          imageId,
          storageId,
          key: keys[name],
          purpose: name === 'thumbnail' ? 'thumbnail' : 'temporary',
          status: name === 'old' ? 'cleanup_failed' : 'stored',
          byteSize: b(name),
          byteSizeConfirmedAt: new Date(),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (name === 'thumbnail')
        db.insert(mediaVersions)
          .values({
            imageId,
            kind: 'thumbnail',
            objectId: id,
            byteSize: b(name),
            format: 'PNG',
            mime: 'image/png',
            createdAt: now,
          })
          .run();
    }
    await write('probe', 64);
    db.insert(storageProbes)
      .values({
        id: randomUUID(),
        storageId,
        key: keys.probe,
        purpose: 'connection',
        configRevision: 1,
        state: 'cleanup',
        stage: 'delete',
        objectState: 'stored',
        byteSize: b('probe'),
        confirmedAt: new Date(),
        report: {
          probeId: 'current-usage-probe',
          storageId,
          revision: 1,
          passed: false,
          stale: false,
          cleanupPending: true,
          stages: [],
          deploymentRequirement: '',
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
    const pending = b('temporary') + b('candidate') + b('old') + b('probe');
    expectUsage(b('original'), b('thumbnail'), pending);
    await observe('candidate-old-probe');
    const mediaTotal =
      b('original') + b('thumbnail') + b('candidate') + b('old');
    trashImage(db, imageId);
    expectUsage(0, 0, b('temporary') + b('probe'), mediaTotal);
    await observe('trash');
    restoreImage(db, imageId);
    expectUsage(b('original'), b('thumbnail'), pending);
    await observe('restore');
    db.update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, storageId))
      .run();
    await observe('disabled-retains-bytes');
    db.update(storageConfigs)
      .set({ enabled: true })
      .where(eq(storageConfigs.id, storageId))
      .run();

    const lateKey = keys.late;
    const signed = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: config.bucket, Key: prefix + lateKey }),
      { expiresIn: 900 },
    );
    attempted.add(lateKey);
    inFlight = put(signed, {
      bytes: 1024 * 1024,
      chunkBytes: 64 * 1024,
      intervalMs: 250,
      timeoutMs: 30_000,
    });
    await delay(100);
    const absence = await remove('late');
    const deletedAt = new Date().toISOString();
    const writeResult = await inFlight;
    assert.equal(writeResult.status, 200, JSON.stringify(writeResult));
    assert.ok(
      writeResult.bodyFinishedAt && writeResult.bodyFinishedAt > deletedAt,
      'Late writer must send its final bytes after DELETE/HEAD confirmed absence',
    );
    const head = await inspectSampleObject(
      client,
      config.bucket,
      prefix + lateKey,
    );
    assert.equal(head.exists, true);
    assert.equal(head.bytes, 1024 * 1024);
    bytes.set('late', head.bytes!);
    await observe(
      'late-unregistered',
      { absence, deletedAt, writeResult, head },
      [lateKey],
    );
    const scanContext = {
      db,
      storageRoot: directory,
      secretCrypto: createSecretCrypto(randomBytes(32)),
      readReferences: readStorageReferences,
      adapterFactory: () =>
        createS3Storage({
          ...config,
          id: storageId,
          enabled: true,
          pathPrefix: '',
        }),
    };
    await assert.rejects(
      scanStorage(
        {
          ...scanContext,
          adapterFactory: () => {
            const storage = scanContext.adapterFactory();
            return {
              ...storage,
              async deleteObject(key: string) {
                if (key === lateKey)
                  throw new Error(
                    'Injected scanner deletion failure for retained-orphan evidence',
                  );
                return storage.deleteObject(key);
              },
            };
          },
        },
        storageId,
      ),
      { code: 'STORAGE_SCAN_FAILED' },
    );
    assert.equal(db.select().from(storageOrphans).get()?.size, b('late'));
    expectUsage(b('original'), b('thumbnail'), pending + b('late'));
    await observe('scanner-retains-orphan-after-injected-delete-failure');
    const scan = await scanStorage(scanContext, storageId);
    assert.equal(scan.status, 'passed');
    assert.equal(
      (await inspectSampleObject(client, config.bucket, prefix + lateKey))
        .exists,
      false,
    );
    expectUsage(b('original'), b('thumbnail'), pending);
    await observe('scanner-retry-deletes-orphan', scan);
    await remove('temporary');
    db.update(uploadSessions)
      .set({ temporaryKey: null, temporaryBytes: null, cleanupStatus: 'none' })
      .where(eq(uploadSessions.id, session.id))
      .run();
    await observe('temporary-deleted');
    await remove('probe');
    db.delete(storageProbes).run();
    await observe('probe-deleted');
    trashImage(db, imageId);
    requestPermanentDelete(db, imageId);
    expectUsage(0, 0, 0, mediaTotal);
    await observe('delete-request-retains-bytes');
    for (const name of ['old', 'candidate', 'thumbnail', 'original']) {
      await remove(name);
      db.update(mediaObjects)
        .set({ status: 'deleted' })
        .where(eq(mediaObjects.key, keys[name]))
        .run();
      await observe(`${name}-deleted`);
    }
    expectUsage(0, 0, 0);
    await observe('empty-after-confirmed-deletions');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.observations.push({
      name: 'failure',
      at: new Date().toISOString(),
      evidence: errorEvidence(error),
    });
  } finally {
    if (inFlight) await inFlight;
    for (const key of attempted) {
      try {
        report.cleanup.push({
          key: prefix + key,
          result: await deleteSampleObject(
            client!,
            config.bucket,
            prefix + key,
          ),
        });
      } catch (error) {
        report.status = 'failed';
        report.cleanup.push({ key: prefix + key, error: errorEvidence(error) });
      }
    }
    client?.destroy();
    connection?.close();
    await save();
  }
  return report;
}
