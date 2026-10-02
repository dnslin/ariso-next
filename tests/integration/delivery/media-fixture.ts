import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { prepareImageDelivery } from '../../../src/server/delivery/response.ts';
import { identifyImageFile } from '../../../src/server/media/file-formats.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { mediaJobs } from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';

/** Real local media processing and delivery; no S3 processor is claimed. */
export async function createMediaDeliveryFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-delivery-media-'));
  for (const part of ['storage', 'tmp']) await mkdir(join(directory, part));
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  const { db } = connection;
  migrateRuntimeDatabase(db, resolve('drizzle'));
  prepareInitialStorage(db, { storage: join(directory, 'storage') });
  db.transaction(prepareInitialMedia);
  const runtime: MediaRuntime = {
    db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger: createRuntimeLogger('delivery.media.test', 'fatal'),
  };
  const state = (imageId: string) => getImageAccessState(db, imageId)!;
  const job = (jobId: string) =>
    db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get()!;
  async function processNext() {
    const claimed = claimNextMediaJob(db);
    if (!claimed) throw new Error('Expected a queued media job');
    await processMediaJob(runtime, claimed.id);
    return job(claimed.id);
  }
  async function accept(file: string) {
    const path = resolve(file);
    const bytes = await readFile(path);
    const facts = await identifyImageFile(path, runtime.temporaryRoot);
    const storage = resolveLocalUploadStorage(db);
    const plan = planLocalWrite('uploads');
    await writeObject(runtime.storageRoot, storage, plan, Readable.from(bytes));
    const accepted = db.transaction((tx) =>
      acceptOriginal(tx, {
        imageId: randomUUID(),
        storageId: storage.id,
        key: plan.key,
        // Deliberately misleading name; HTTP names/types must follow real bytes.
        originalName: '原始文件.fake',
        visibility: 'public',
        format: facts.format,
        mime: facts.mime,
        byteSize: bytes.length,
        snapshot: createProcessingSnapshot(tx),
        expectedVersions: ['compressed', 'thumbnail'],
      }),
    );
    await processNext();
    return { ...accepted, bytes, facts };
  }
  const request = (imageId: string, query = '', init: RequestInit = {}) =>
    prepareImageDelivery(
      new Request(`http://ariso.test/i/${imageId}${query}`, init),
      imageId,
      {
        db,
        storageRoot: runtime.storageRoot,
        readOwner: async () => false,
        logger: runtime.logger,
      },
    );
  async function close() {
    connection.close();
    await rm(directory, { recursive: true, force: true });
  }
  return { db, runtime, state, job, accept, processNext, request, close };
}
