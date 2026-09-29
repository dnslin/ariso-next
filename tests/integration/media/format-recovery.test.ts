import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import { mediaObjects } from '../../../src/server/media/schema.ts';
import { recoverMediaJobs } from '../../../src/server/media/recovery.ts';
import { identifyImageFile } from '../../../src/server/media/file-formats.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-format-recovery-'));
  await mkdir(join(directory, 'storage'));
  await mkdir(join(directory, 'tmp'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  runtime = {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger: createRuntimeLogger('media.test', 'fatal'),
  };
});
afterEach(async () => {
  connection.close();
  await rm(directory, { recursive: true, force: true });
});

function objectPath(storage: { localPath: string; id: string }, key: string) {
  return join(runtime.storageRoot, storage.localPath, 'ariso', storage.id, key);
}

describe('T-MED-06 compressed-format interruption recovery', () => {
  for (const outputFormat of ['jpeg', 'avif'] as const) {
    it.each(['complete', 'wrong-format'] as const)(
      `${outputFormat} validates a %s writing candidate and continues the thumbnail`,
      async (mode) => {
        const original = await readFile(
          resolve('tests/fixtures/media-formats/source.png'),
        );
        const storage = resolveLocalUploadStorage(connection.db);
        const originalPlan = planLocalWrite('uploads');
        await writeObject(
          runtime.storageRoot,
          storage,
          originalPlan,
          Readable.from(original),
        );
        const accepted = connection.db.transaction((tx) =>
          acceptOriginal(tx, {
            imageId: randomUUID(),
            storageId: storage.id,
            key: originalPlan.key,
            originalName: 'source.png',
            visibility: 'public',
            format: 'PNG',
            mime: 'image/png',
            byteSize: original.length,
            snapshot: {
              ...createProcessingSnapshot(tx),
              compressionEnabled: true,
              outputFormat,
            },
            expectedVersions: ['compressed', 'thumbnail'],
          }),
        );
        expect(claimNextMediaJob(connection.db)?.id).toBe(accepted.jobId);
        const candidate = connection.db.transaction((tx) =>
          planDerivedObject(tx, accepted.jobId, 'compressed'),
        );
        connection.db
          .update(mediaObjects)
          .set({ status: 'writing' })
          .where(eq(mediaObjects.jobId, accepted.jobId))
          .run();
        const encoded = await execa(
          'magick',
          [
            'png:-',
            '-strip',
            '-quality',
            '82',
            `${mode === 'complete' ? outputFormat : 'webp'}:-`,
          ],
          {
            input: original,
            encoding: 'buffer',
          },
        );
        await writeObject(
          runtime.storageRoot,
          storage,
          candidate,
          Readable.from(Buffer.from(encoded.stdout)),
        );
        // The process stopped after the final rename but before publication. Reopen
        // SQLite so the test cannot accidentally rely on in-memory job state.
        connection.close();
        connection = openRuntimeDatabase(join(directory, 'ariso.db'));
        runtime.db = connection.db;
        expect(recoverMediaJobs(connection.db)).toEqual([accepted.jobId]);
        expect(claimNextMediaJob(connection.db)?.id).toBe(accepted.jobId);
        await processMediaJob(runtime, accepted.jobId);
        const result = getImageAccessState(connection.db, accepted.imageId)!;
        expect(result.latestJob).toMatchObject({
          status: 'succeeded',
          error: null,
          retryCount: 0,
        });
        expect(result.image.processingStatus).toBe('ready');
        const compressed = result.versions.find(
          (version) => version.kind === 'compressed',
        )!.saved!;
        expect(compressed.version).toMatchObject({
          format: outputFormat.toUpperCase(),
          mime: `image/${outputFormat}`,
        });
        const candidateRow = connection.db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, candidate.objectId))
          .get()!;
        if (mode === 'complete') {
          expect(compressed.object.id).toBe(candidate.objectId);
          expect(candidateRow.status).toBe('stored');
          expect(await readFile(objectPath(storage, candidate.key))).toEqual(
            Buffer.from(encoded.stdout),
          );
        } else {
          expect(compressed.object.id).not.toBe(candidate.objectId);
          expect(candidateRow).toMatchObject({
            status: 'deleted',
            byteSize: 0,
          });
          await expect(
            stat(objectPath(storage, candidate.key)),
          ).rejects.toMatchObject({ code: 'ENOENT' });
        }
        const compressedPath = objectPath(storage, compressed.object.key);
        expect(
          await identifyImageFile(compressedPath, runtime.temporaryRoot),
        ).toMatchObject({
          format: outputFormat.toUpperCase(),
          mime: `image/${outputFormat}`,
        });
        await expect(
          execa('magick', [`${outputFormat}:${compressedPath}`, 'null:']),
        ).resolves.toMatchObject({ exitCode: 0 });
        const thumbnail = result.versions.find(
          (version) => version.kind === 'thumbnail',
        )!.saved!;
        expect(thumbnail.version).toMatchObject({
          format: 'WEBP',
          mime: 'image/webp',
          width: 64,
          height: 48,
        });
        expect(
          await identifyImageFile(
            objectPath(storage, thumbnail.object.key),
            runtime.temporaryRoot,
          ),
        ).toMatchObject({ format: 'WEBP' });
        expect(await readFile(objectPath(storage, originalPlan.key))).toEqual(
          original,
        );
      },
      15000,
    );
  }
});
