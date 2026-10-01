import { randomUUID } from 'node:crypto';
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
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';

it('cleans local candidates behind twenty S3 records without deleting published original or remote objects', async () => {
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
    await cleanupMediaCandidates({
      db,
      storageRoot,
      temporaryRoot: join(directory, 'tmp'),
      logger: createRuntimeLogger('cleanup.test', 'fatal'),
    });
    expect(
      db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, candidateId))
        .get(),
    ).toMatchObject({ status: 'deleted', byteSize: 0 });
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
      remoteCandidates.filter((object) => object.status === 'cleanup_pending'),
    ).toHaveLength(20);
    expect(
      remoteCandidates.find((object) => object.id === remote.objectId)!.status,
    ).toBe('stored');
  } finally {
    connection.close();
    await rm(directory, { recursive: true, force: true });
  }
});
