import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  inspectObject,
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';
import {
  prepareInitialMedia,
  createProcessingSnapshot,
} from '../../../src/server/media/settings.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { mediaJobs, mediaObjects } from '../../../src/server/media/schema.ts';
import { cleanupMediaCandidates } from '../../../src/server/media/candidate-cleanup.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';

it('cleans exact Local/S3 candidates in bounded batches, preserves published objects and records remote failure', async () => {
  const deleted: string[] = [];
  const server = createServer((request, response) => {
    const key = new URL(request.url!, 'http://localhost').pathname
      .split('/')
      .at(-1)!;
    if (
      key === 'denied' ||
      (key === 'denied-after-head' && request.method === 'DELETE')
    ) {
      response.writeHead(403, { 'content-type': 'application/xml' });
      response.end(
        '<Error><Code>AccessDenied</Code><Message>Denied cleanup</Message></Error>',
      );
    } else if (request.method === 'DELETE') {
      deleted.push(key);
      response.writeHead(204).end();
    } else if (deleted.includes(key)) {
      response.writeHead(404).end();
    } else {
      response.writeHead(200, { 'content-length': '4' }).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const crypto = createSecretCrypto(Buffer.alloc(32, 1));
  const directory = await mkdtemp(join(tmpdir(), 'ariso-candidate-cleanup-'));
  const storageRoot = join(directory, 'storage');
  await mkdir(storageRoot);
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  try {
    const { db } = connection;
    migrateRuntimeDatabase(db, resolve('drizzle'));
    prepareInitialStorage(db, { storage: storageRoot });
    db.transaction(prepareInitialMedia);
    const local = resolveLocalUploadStorage(db);
    const remoteId = randomUUID();
    const now = new Date();
    db.insert(storageConfigs)
      .values({
        id: remoteId,
        name: 'remote boundary',
        type: 's3',
        enabled: true,
        endpoint: `http://127.0.0.1:${address.port}`,
        region: 'test',
        bucket: 'test',
        pathPrefix: 'test',
        forcePathStyle: true,
        accessKeyEncrypted: crypto.encryptSecret('test-access'),
        secretKeyEncrypted: crypto.encryptSecret('test-secret'),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    function asset(storageId: string, key: string) {
      return db.transaction((tx) => {
        const result = acceptOriginal(tx, {
          imageId: randomUUID(),
          storageId,
          key,
          originalName: 'test.png',
          visibility: 'private',
          format: 'PNG',
          mime: 'image/png',
          byteSize: 4,
          snapshot: createProcessingSnapshot(tx),
          expectedVersions: [],
        });
        tx.update(mediaJobs)
          .set({ status: 'failed' })
          .where(eq(mediaJobs.id, result.jobId))
          .run();
        return result;
      });
    }
    const remote = asset(remoteId, 'remote-original');
    db.insert(mediaObjects)
      .values(
        Array.from({ length: 20 }, (_, index) => ({
          id: randomUUID(),
          imageId: remote.imageId,
          jobId: remote.jobId,
          storageId: remoteId,
          key: `remote-candidate-${index}`,
          purpose: 'temporary' as const,
          status: 'cleanup_pending' as const,
          byteSize: 4,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
    const originalPlan = planLocalWrite('uploads');
    await writeObject(storageRoot, local, originalPlan, Readable.from('data'));
    const original = asset(local.id, originalPlan.key);
    const candidatePlan = planLocalWrite('candidates');
    await writeObject(storageRoot, local, candidatePlan, Readable.from('data'));
    const candidateId = randomUUID();
    db.insert(mediaObjects)
      .values({
        id: candidateId,
        imageId: original.imageId,
        jobId: original.jobId,
        storageId: local.id,
        key: candidatePlan.key,
        purpose: 'temporary',
        status: 'cleanup_pending',
        byteSize: 4,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const runtime = {
      db,
      secretCrypto: crypto,
      storageRoot,
      temporaryRoot: join(directory, 'tmp'),
      logger: createRuntimeLogger('cleanup.test', 'fatal'),
    };
    await cleanupMediaCandidates(runtime);
    await cleanupMediaCandidates(runtime);
    expect(
      db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, candidateId))
        .get(),
    ).toMatchObject({
      status: 'deleted',
      byteSize: 0,
      byteSizeConfirmedAt: expect.any(Date),
    });
    expect(
      await inspectObject(storageRoot, local, candidatePlan.key),
    ).toBeNull();
    expect(await inspectObject(storageRoot, local, originalPlan.key)).toEqual({
      size: 4,
    });
    const remoteCandidates = db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.storageId, remoteId))
      .all();
    expect(
      remoteCandidates.filter((object) => object.status === 'deleted'),
    ).toHaveLength(20);
    expect(
      remoteCandidates
        .filter((object) => object.status === 'deleted')
        .every((object) => object.byteSizeConfirmedAt instanceof Date),
    ).toBe(true);
    expect(deleted.sort()).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `remote-candidate-${index}`,
      ).sort(),
    );
    const deniedId = randomUUID();
    db.insert(mediaObjects)
      .values({
        id: deniedId,
        imageId: remote.imageId,
        jobId: remote.jobId,
        storageId: remoteId,
        key: 'denied',
        purpose: 'temporary',
        status: 'cleanup_pending',
        byteSize: 4,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await cleanupMediaCandidates(runtime);
    expect(
      db.select().from(mediaObjects).where(eq(mediaObjects.id, deniedId)).get(),
    ).toMatchObject({
      status: 'cleanup_failed',
      byteSize: 4,
      byteSizeConfirmedAt: null,
    });
    expect(deleted).not.toContain('denied');
    const confirmedFailureId = randomUUID();
    const settlementId = randomUUID();
    db.insert(mediaObjects)
      .values(
        [
          { id: confirmedFailureId, key: 'denied-after-head' },
          { id: settlementId, key: 'settlement-candidate' },
        ].map((object) => ({
          ...object,
          imageId: remote.imageId,
          jobId: remote.jobId,
          storageId: remoteId,
          purpose: 'temporary' as const,
          status: 'cleanup_pending' as const,
          byteSize: null,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
    db.$client.exec(
      `CREATE TRIGGER reject_candidate_settlement BEFORE UPDATE OF status ON media_objects WHEN NEW.id = '${settlementId}' AND NEW.status = 'deleted' BEGIN SELECT RAISE(ABORT, 'candidate settlement failed'); END`,
    );
    await expect(cleanupMediaCandidates(runtime)).rejects.toThrow(
      'candidate settlement failed',
    );
    expect(
      db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, confirmedFailureId))
        .get(),
    ).toMatchObject({
      status: 'cleanup_failed',
      byteSize: 4,
      byteSizeConfirmedAt: expect.any(Date),
      error: expect.stringContaining('Denied cleanup'),
    });
    expect(
      db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, settlementId))
        .get(),
    ).toMatchObject({
      status: 'cleanup_pending',
      byteSize: null,
      byteSizeConfirmedAt: null,
    });
    expect(deleted).toContain('settlement-candidate');
    db.$client.exec('DROP TRIGGER reject_candidate_settlement');
    await cleanupMediaCandidates(runtime);
    expect(
      db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, settlementId))
        .get(),
    ).toMatchObject({
      status: 'deleted',
      byteSize: 0,
      byteSizeConfirmedAt: expect.any(Date),
    });
    expect(
      remoteCandidates.find((object) => object.id === remote.objectId)!.status,
    ).toBe('stored');
  } finally {
    connection.close();
    await rm(directory, { recursive: true, force: true });
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
