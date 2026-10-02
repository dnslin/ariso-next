import * as local from '../../../src/server/storage/local.ts';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import {
  requestPermanentDelete,
  readMediaCleanup,
} from '../../../src/server/media/cleanup.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import { startMediaQueue } from '../../../src/server/media/queue.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { trashImage } from '../../../src/server/media/trash.ts';
import * as tools from '../../../src/server/media/tools.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  inspectObject,
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';

it.each(['encoding', 'stored-output'] as const)(
  'cancels actual reprocessing at %s, settles tools and deletes current and in-flight objects',
  async (checkpoint) => {
    const directory = await mkdtemp(join(tmpdir(), 'ariso-delete-tools-'));
    const storageRoot = join(directory, 'storage');
    const temporaryRoot = join(directory, 'tmp');
    await mkdir(storageRoot);
    await mkdir(temporaryRoot);
    const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    let queue: ReturnType<typeof startMediaQueue> | undefined;
    const executions: ReturnType<typeof tools.startMediaTool>[] = [];
    try {
      const { db } = connection;
      migrateRuntimeDatabase(db, resolve('drizzle'));
      prepareInitialStorage(db, { storage: storageRoot });
      db.transaction(prepareInitialMedia);
      const storage = resolveLocalUploadStorage(db);
      const bytes = await readFile(
        resolve('tests/fixtures/runtime/images/sample.png'),
      );
      const plan = planLocalWrite('uploads');
      await writeObject(storageRoot, storage, plan, Readable.from(bytes));
      const accepted = db.transaction((tx) =>
        acceptOriginal(tx, {
          imageId: randomUUID(),
          storageId: storage.id,
          key: plan.key,
          originalName: 'actual-tools.png',
          visibility: 'private',
          format: 'PNG',
          mime: 'image/png',
          byteSize: bytes.length,
          snapshot: createProcessingSnapshot(tx),
          expectedVersions: ['compressed', 'thumbnail'],
        }),
      );
      queue = startMediaQueue({
        db,
        storageRoot,
        temporaryRoot,
        logger: { info: () => {}, error: () => {} },
      });
      await vi.waitFor(
        () =>
          expect(db.select().from(mediaImages).get()!.processingStatus).toBe(
            'ready',
          ),
        { timeout: 15000 },
      );
      const priorKeys = db
        .select()
        .from(mediaObjects)
        .all()
        .map((object) => object.key);
      const actual = tools.startMediaTool;
      let deleted = false;
      const writtenCandidates: string[] = [];
      vi.spyOn(tools, 'startMediaTool').mockImplementation((...args) => {
        const execution = actual(...args);
        executions.push(execution);
        if (
          checkpoint === 'encoding' &&
          !deleted &&
          args[0] === 'magick' &&
          args[1].includes('-auto-orient')
        ) {
          deleted = true;
          trashImage(db, accepted.imageId);
          requestPermanentDelete(db, accepted.imageId);
        }
        return execution;
      });
      if (checkpoint === 'stored-output') {
        const actualWrite = local.writeObject;
        vi.spyOn(local, 'writeObject').mockImplementation(async (...args) => {
          const result = await actualWrite(...args);
          writtenCandidates.push(args[2].key);
          if (!deleted) {
            expect(
              await inspectObject(storageRoot, storage, args[2].key),
            ).toMatchObject({ size: result.size });
            expect(result.size).toBeGreaterThan(0);
            deleted = true;
            trashImage(db, accepted.imageId);
            requestPermanentDelete(db, accepted.imageId);
          }
          return result;
        });
      }
      requestReprocess(db, accepted.imageId, { scope: 'all' });
      await vi.waitFor(() => expect(deleted).toBe(true), { timeout: 15000 });
      await vi.waitFor(
        () =>
          expect(readMediaCleanup(db, accepted.imageId).status).toBe(
            'succeeded',
          ),
        { timeout: 15000 },
      );
      await queue.stop();
      queue = undefined;
      expect(
        executions.some((execution) => execution.child.pid !== undefined),
      ).toBe(true);
      for (const execution of executions) {
        await execution.settled;
        expect(
          execution.child.exitCode !== null ||
            execution.child.signalCode !== null,
        ).toBe(true);
      }
      if (checkpoint === 'stored-output')
        expect(writtenCandidates).toHaveLength(1);
      for (const key of [...priorKeys, ...writtenCandidates])
        expect(await inspectObject(storageRoot, storage, key)).toBeNull();
      expect(db.select().from(mediaImages).all()).toEqual([]);
      expect(db.select().from(mediaObjects).all()).toEqual([]);
      expect(db.select().from(mediaJobs).all()).toEqual([]);
      expect(await readdir(temporaryRoot)).toEqual([]);
    } finally {
      await queue?.stop();
      vi.restoreAllMocks();
      connection.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  45000,
);
