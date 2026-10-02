import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  readObject,
  writeObject,
} from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  patchMediaSettings,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  type VersionKind,
} from '../../../src/server/media/schema.ts';
import {
  processMediaJob,
  type MediaRuntime,
} from '../../../src/server/media/process.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { recoverMediaJobs } from '../../../src/server/media/recovery.ts';
import { readGeneratedMediaVersions } from '../../../src/server/media/objects.ts';
import {
  requestReprocess,
  MediaReprocessError,
} from '../../../src/server/media/reprocess.ts';
import {
  cleanupMediaCandidates,
  recoverMediaCandidateCleanup,
} from '../../../src/server/media/candidate-cleanup.ts';
import * as tools from '../../../src/server/media/tools.ts';
import * as local from '../../../src/server/storage/local.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-reprocess-'));
  for (const part of ['storage', 'tmp']) await mkdir(join(directory, part));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  runtime = {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger: createRuntimeLogger('reprocess.test', 'fatal'),
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  connection?.close();
  await rm(directory, { recursive: true, force: true });
});
const state = (id: string) => getImageAccessState(connection.db, id)!;
const versions = (id: string) =>
  connection.db
    .select()
    .from(mediaVersions)
    .where(eq(mediaVersions.imageId, id))
    .all();
const job = (id: string) =>
  connection.db.select().from(mediaJobs).where(eq(mediaJobs.id, id)).get()!;
async function processNext() {
  const claimed = claimNextMediaJob(connection.db);
  expect(claimed).not.toBeNull();
  await processMediaJob(runtime, claimed!.id);
  return claimed!.id;
}
async function bytes(id: string, kind: VersionKind) {
  const saved = state(id).versions.find((row) => row.kind === kind)!.saved!;
  const content = await readObject(
    runtime.storageRoot,
    resolveLocalUploadStorage(connection.db, saved.object.storageId),
    saved.object.key,
    saved.version.mime,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of content.stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function accept(
  file = 'tests/fixtures/runtime/images/sample.png',
  ready = true,
) {
  const original = await readFile(resolve(file));
  const storage = resolveLocalUploadStorage(connection.db);
  const write = planLocalWrite('uploads');
  await writeObject(
    runtime.storageRoot,
    storage,
    write,
    Readable.from(original),
  );
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: write.key,
      originalName: 'source.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: original.length,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    }),
  );
  if (ready) await processNext();
  return { ...accepted, original, storage };
}

it.each(['all', 'compressed', 'thumbnail', 'watermark'] as const)(
  'reprocesses %s using a new snapshot while preserving identity, original and unselected versions',
  async (scope) => {
    const asset = await accept();
    const before = state(asset.imageId);
    const previous = versions(asset.imageId);
    patchMediaSettings(connection.db, {
      outputFormat: 'jpeg',
      quality: 47,
      maxEdge: 32,
      watermarkMode: 'text',
      watermarkText: 'A',
      watermarkFont: 'latin',
    });
    const accepted = requestReprocess(connection.db, asset.imageId, { scope });
    expect(accepted.scope).toBe(scope);
    expect(accepted.expectedVersions).toEqual(
      job(accepted.jobId).expectedVersions,
    );
    patchMediaSettings(connection.db, { quality: 95, maxEdge: 16 });
    expect(job(accepted.jobId).snapshot).toMatchObject({
      quality: 47,
      maxEdge: 32,
      outputFormat: 'jpeg',
    });
    expect(state(asset.imageId).image.processingStatus).toBe('ready');
    await processNext();
    expect(job(accepted.jobId)).toMatchObject({ status: 'succeeded', scope });
    const after = state(asset.imageId);
    expect(after.image).toMatchObject({
      id: before.image.id,
      storageId: before.image.storageId,
      originalName: before.image.originalName,
      displayName: before.image.displayName,
      visibility: before.image.visibility,
      processingStatus: 'ready',
    });
    expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
    const selected =
      scope === 'all' ? ['compressed', 'thumbnail', 'watermark'] : [scope];
    for (const row of previous) {
      const next = versions(asset.imageId).find(
        (value) => value.kind === row.kind,
      )!;
      if (selected.includes(row.kind))
        expect(next.objectId).not.toBe(row.objectId);
      else expect(next).toEqual(row);
    }
    if (scope !== 'thumbnail') {
      const derived = after.versions.find(
        (row) =>
          row.kind === (scope === 'watermark' ? 'watermark' : 'compressed'),
      )!.saved!;
      expect(derived.version).toMatchObject({
        width: 32,
        height: 24,
        mime: 'image/jpeg',
      });
      expect(
        (await bytes(asset.imageId, derived.version.kind)).subarray(0, 2),
      ).toEqual(Buffer.from([0xff, 0xd8]));
    }
  },
);

it('defaults to all and retains old disabled compressed and watermark versions', async () => {
  patchMediaSettings(connection.db, {
    watermarkMode: 'text',
    watermarkText: 'A',
    watermarkFont: 'latin',
  });
  const asset = await accept();
  const before = versions(asset.imageId);
  patchMediaSettings(connection.db, {
    compressionEnabled: false,
    watermarkMode: 'off',
    defaultLinkVersion: 'original',
  });
  for (const scope of ['compressed', 'watermark'] as const)
    expect(() =>
      requestReprocess(connection.db, asset.imageId, { scope }),
    ).toThrow(MediaReprocessError);
  const accepted = requestReprocess(connection.db, asset.imageId, {});
  expect(job(accepted.jobId)).toMatchObject({
    scope: 'all',
    expectedVersions: ['thumbnail'],
  });
  await processNext();
  for (const kind of ['original', 'compressed', 'watermark'])
    expect(versions(asset.imageId).find((row) => row.kind === kind)).toEqual(
      before.find((row) => row.kind === kind),
    );
});

it('rejects inapplicable ranges for animated images and accepts thumbnail and all', async () => {
  const asset = await accept('tests/fixtures/media-formats/animated.gif');
  expect(state(asset.imageId).image.classification).toBe('animated');
  patchMediaSettings(connection.db, {
    watermarkMode: 'text',
    watermarkText: 'A',
  });
  for (const scope of ['compressed', 'watermark'] as const)
    expect(() =>
      requestReprocess(connection.db, asset.imageId, { scope }),
    ).toThrow(MediaReprocessError);
  for (const scope of ['thumbnail', 'all'] as const) {
    const accepted = requestReprocess(connection.db, asset.imageId, { scope });
    await processNext();
    expect(job(accepted.jobId)).toMatchObject({
      status: 'succeeded',
      expectedVersions: ['thumbnail'],
    });
  }
  expect(versions(asset.imageId).map((row) => row.kind)).toEqual([
    'original',
    'thumbnail',
  ]);
  expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
});

it('only accepts all for a failed image and never reuses old-snapshot outputs', async () => {
  const asset = await accept();
  connection.db
    .update(mediaImages)
    .set({ processingStatus: 'failed' })
    .where(eq(mediaImages.id, asset.imageId))
    .run();
  const before = versions(asset.imageId);
  for (const scope of ['compressed', 'thumbnail', 'watermark'] as const)
    expect(() =>
      requestReprocess(connection.db, asset.imageId, { scope }),
    ).toThrow(MediaReprocessError);
  patchMediaSettings(connection.db, { outputFormat: 'jpeg', maxEdge: 32 });
  const accepted = requestReprocess(connection.db, asset.imageId, {});
  await processNext();
  expect(job(accepted.jobId).status).toBe('succeeded');
  expect(state(asset.imageId).image.processingStatus).toBe('ready');
  for (const row of before.filter((row) => row.kind !== 'original'))
    expect(
      versions(asset.imageId).find((value) => value.kind === row.kind)!
        .objectId,
    ).not.toBe(row.objectId);
});

it('serializes acceptance and rejects lifecycle, storage and conflicting active tasks', async () => {
  const asset = await accept();
  requestReprocess(connection.db, asset.imageId, { scope: 'thumbnail' });
  const other = openRuntimeDatabase(join(directory, 'ariso.db'));
  try {
    const count = connection.db.select().from(mediaJobs).all().length;
    expect(() =>
      requestReprocess(other.db, asset.imageId, { scope: 'thumbnail' }),
    ).toThrow(MediaReprocessError);
    expect(() =>
      requestReprocess(other.db, asset.imageId, { scope: 'all' }),
    ).toThrow(MediaReprocessError);
    expect(connection.db.select().from(mediaJobs).all()).toHaveLength(count);
  } finally {
    other.close();
  }
  await processNext();
  for (const patch of [
    { trashedAt: new Date() },
    { deletionStatus: 'deleting' as const },
    { deletionStatus: 'cleanup_failed' as const },
  ]) {
    connection.db.update(mediaImages).set(patch).run();
    expect(() => requestReprocess(connection.db, asset.imageId, {})).toThrow(
      MediaReprocessError,
    );
    connection.db
      .update(mediaImages)
      .set({ trashedAt: null, deletionStatus: null })
      .run();
  }
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  expect(() => requestReprocess(connection.db, asset.imageId, {})).toThrow(
    MediaReprocessError,
  );
  expect(() => requestReprocess(connection.db, 'missing', {})).toThrow(
    MediaReprocessError,
  );
});

it.each(['compressed', 'thumbnail', 'watermark'] as const)(
  'retains every ready version when %s output fails',
  async (kind) => {
    patchMediaSettings(connection.db, {
      watermarkMode: 'text',
      watermarkText: 'A',
      watermarkFont: 'latin',
    });
    const asset = await accept();
    const before = versions(asset.imageId);
    const accepted = requestReprocess(connection.db, asset.imageId, {});
    const actualWrite = local.writeObject;
    vi.spyOn(local, 'writeObject').mockImplementation(async (...args) => {
      if (args[2].key.includes(`/${kind}/`)) {
        for await (const chunk of args[3]) void chunk;
        throw Object.assign(new Error(`injected ${kind} output denial`), {
          code: 'EACCES',
        });
      }
      return actualWrite(...args);
    });
    await processNext();
    expect(job(accepted.jobId)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining(`injected ${kind} output denial`),
    });
    expect(state(asset.imageId).image.processingStatus).toBe('ready');
    expect(versions(asset.imageId)).toEqual(before);
    expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
  },
);

it('rolls back all selected versions when final publication fails and accounts for every candidate', async () => {
  const asset = await accept();
  const before = versions(asset.imageId);
  const accepted = requestReprocess(connection.db, asset.imageId, {});
  connection.db.$client.exec(
    "CREATE TRIGGER reject_reprocess_publish BEFORE UPDATE OF object_id ON media_versions WHEN NEW.kind = 'thumbnail' BEGIN SELECT RAISE(ABORT, 'injected atomic publication failure'); END",
  );
  await processNext();
  expect(job(accepted.jobId)).toMatchObject({
    status: 'failed',
    error: expect.stringContaining('injected atomic publication failure'),
  });
  expect(versions(asset.imageId)).toEqual(before);
  expect(state(asset.imageId).image.processingStatus).toBe('ready');
  const candidates = connection.db
    .select()
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.jobId, accepted.jobId),
        inArray(mediaObjects.purpose, ['compressed', 'thumbnail']),
      ),
    )
    .all();
  expect(candidates).toHaveLength(2);
  expect(
    candidates.every((row) =>
      ['cleanup_pending', 'cleanup_failed', 'deleted'].includes(row.status),
    ),
  ).toBe(true);
});

it.each(['disabled', 'deleting', 'cancelled', 'trashed'] as const)(
  'rechecks %s during asynchronous generation',
  async (condition) => {
    const asset = await accept();
    const before = versions(asset.imageId);
    const accepted = requestReprocess(connection.db, asset.imageId, {});
    const actualStart = tools.startMediaTool;
    let changed = false;
    vi.spyOn(tools, 'startMediaTool').mockImplementation(
      (command, args, options) => {
        if (
          !changed &&
          command === 'magick' &&
          args.some((arg) => arg.endsWith(':-'))
        ) {
          changed = true;
          if (condition === 'disabled')
            connection.db.update(storageConfigs).set({ enabled: false }).run();
          if (condition === 'deleting')
            connection.db
              .update(mediaImages)
              .set({ deletionStatus: 'deleting' })
              .run();
          if (condition === 'cancelled')
            connection.db
              .update(mediaJobs)
              .set({ status: 'cancelled' })
              .where(eq(mediaJobs.id, accepted.jobId))
              .run();
          if (condition === 'trashed')
            connection.db
              .update(mediaImages)
              .set({ trashedAt: new Date() })
              .run();
        }
        return actualStart(command, args, options);
      },
    );
    await processNext();
    expect(changed).toBe(true);
    expect(state(asset.imageId).image.processingStatus).toBe('ready');
    expect(job(accepted.jobId).status).toBe(
      condition === 'trashed'
        ? 'succeeded'
        : condition === 'cancelled'
          ? 'cancelled'
          : 'failed',
    );
    if (condition !== 'trashed')
      expect(versions(asset.imageId)).toEqual(before);
    else
      expect(
        versions(asset.imageId).find((row) => row.kind === 'thumbnail')!
          .objectId,
      ).not.toBe(before.find((row) => row.kind === 'thumbnail')!.objectId);
  },
);

it('recovers a stored unpublished candidate without exposing it early or regenerating the saved step', async () => {
  const asset = await accept();
  const before = versions(asset.imageId);
  const accepted = requestReprocess(connection.db, asset.imageId, {});
  expect(
    readGeneratedMediaVersions(connection.db, [job(accepted.jobId)]).get(
      accepted.jobId,
    ),
  ).toEqual([]);
  const actualStart = tools.startMediaTool;
  const controller = new AbortController();
  let interrupted = false;
  vi.spyOn(tools, 'startMediaTool').mockImplementation(
    (command, args, options) => {
      const stored = connection.db
        .select()
        .from(mediaObjects)
        .where(
          and(
            eq(mediaObjects.jobId, accepted.jobId),
            eq(mediaObjects.purpose, 'compressed'),
            eq(mediaObjects.status, 'stored'),
          ),
        )
        .get();
      if (
        !interrupted &&
        stored &&
        command === 'magick' &&
        args.some((arg) => arg.endsWith(':-'))
      ) {
        interrupted = true;
        controller.abort(
          Object.assign(new Error('injected shutdown after candidate save'), {
            code: 'MEDIA_INTERRUPTED',
          }),
        );
      }
      return actualStart(command, args, options);
    },
  );
  claimNextMediaJob(connection.db);
  await processMediaJob(runtime, accepted.jobId, controller.signal);
  expect(interrupted).toBe(true);
  expect(job(accepted.jobId).status).toBe('running');
  expect(versions(asset.imageId)).toEqual(before);
  const stored = connection.db
    .select()
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.jobId, accepted.jobId),
        eq(mediaObjects.purpose, 'compressed'),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .get()!;
  expect(stored).toBeDefined();
  expect(
    readGeneratedMediaVersions(connection.db, [job(accepted.jobId)]).get(
      accepted.jobId,
    ),
  ).toEqual(['compressed']);
  vi.restoreAllMocks();
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  runtime.db = connection.db;
  recoverMediaJobs(connection.db);
  await processNext();
  expect(job(accepted.jobId)).toMatchObject({
    status: 'succeeded',
    retryCount: 0,
  });
  expect(
    readGeneratedMediaVersions(connection.db, [job(accepted.jobId)]).get(
      accepted.jobId,
    ),
  ).toEqual(['compressed', 'thumbnail']);
  expect(
    versions(asset.imageId).find((row) => row.kind === 'compressed')!.objectId,
  ).toBe(stored.id);
  expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
});

it('keeps new versions when old-object cleanup fails and retries known keys after reopening', async () => {
  const asset = await accept();
  const before = versions(asset.imageId);
  const oldObjects = before
    .filter((row) => row.kind !== 'original')
    .map((row) =>
      connection.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, row.objectId))
        .get()!,
    );
  const originalObjectId = before.find(
    (row) => row.kind === 'original',
  )!.objectId;
  const actualDelete = local.deleteObject;
  vi.spyOn(local, 'deleteObject').mockImplementation(async (...args) => {
    if (oldObjects.some((row) => row.key === args[2]))
      throw Object.assign(new Error('injected old cleanup denied'), {
        code: 'EACCES',
      });
    return actualDelete(...args);
  });
  const accepted = requestReprocess(connection.db, asset.imageId, {});
  await processNext();
  await cleanupMediaCandidates(runtime);
  expect(job(accepted.jobId).status).toBe('succeeded');
  expect(state(asset.imageId).image).toMatchObject({
    processingStatus: 'ready',
    deletionStatus: null,
  });
  for (const old of oldObjects)
    expect(
      connection.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, old.id))
        .get(),
    ).toMatchObject({
      status: 'cleanup_failed',
      byteSize: old.byteSize,
      error: expect.stringContaining('injected old cleanup denied'),
    });
  const published = versions(asset.imageId);
  vi.restoreAllMocks();
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  runtime.db = connection.db;
  recoverMediaCandidateCleanup(connection.db);
  await cleanupMediaCandidates(runtime);
  await cleanupMediaCandidates(runtime);
  expect(versions(asset.imageId)).toEqual(published);
  for (const old of oldObjects)
    expect(
      connection.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, old.id))
        .get()!.status,
    ).toBe('deleted');
  expect(
    connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, originalObjectId))
      .get()!.status,
  ).toBe('stored');
  expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
});

it.each(['compressed', 'thumbnail', 'watermark'] as const)(
  'retains all old references when %s stored-result registration fails',
  async (kind) => {
    patchMediaSettings(connection.db, {
      watermarkMode: 'text',
      watermarkText: 'A',
      watermarkFont: 'latin',
    });
    const asset = await accept();
    const before = versions(asset.imageId);
    const accepted = requestReprocess(connection.db, asset.imageId, {});
    connection.db.$client.exec(
      `CREATE TRIGGER reject_stored_candidate BEFORE UPDATE OF status ON media_objects WHEN NEW.status='stored' AND NEW.purpose='${kind}' AND NEW.job_id='${accepted.jobId}' BEGIN SELECT RAISE(ABORT, 'injected stored candidate registration failure'); END`,
    );
    await processNext();
    expect(job(accepted.jobId)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining(
        'injected stored candidate registration failure',
      ),
    });
    expect(versions(asset.imageId)).toEqual(before);
    expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
    expect(state(asset.imageId).image.processingStatus).toBe('ready');
  },
);

it.each([false, true])(
  'keeps watermark-only compressed intermediate unpublished and cleanable (failure=%s)',
  async (fail) => {
    const asset = await accept();
    const before = versions(asset.imageId);
    const oldCompressed = await bytes(asset.imageId, 'compressed');
    patchMediaSettings(connection.db, {
      watermarkMode: 'text',
      watermarkText: 'A',
      watermarkFont: 'latin',
      outputFormat: 'jpeg',
      maxEdge: 32,
    });
    const accepted = requestReprocess(connection.db, asset.imageId, {
      scope: 'watermark',
    });
    const actualStart = tools.startMediaTool;
    let checkedIntermediate = false;
    vi.spyOn(tools, 'startMediaTool').mockImplementation(
      (command, args, options) => {
        const intermediate = connection.db
          .select()
          .from(mediaObjects)
          .where(
            and(
              eq(mediaObjects.jobId, accepted.jobId),
              eq(mediaObjects.purpose, 'compressed'),
              eq(mediaObjects.status, 'stored'),
            ),
          )
          .get();
        if (intermediate) {
          checkedIntermediate = true;
          expect(
            readGeneratedMediaVersions(connection.db, [
              job(accepted.jobId),
            ]).get(accepted.jobId),
          ).not.toContain('compressed');
        }
        return actualStart(command, args, options);
      },
    );
    if (fail)
      connection.db.$client.exec(
        `CREATE TRIGGER reject_watermark_candidate BEFORE UPDATE OF status ON media_objects WHEN NEW.status='stored' AND NEW.purpose='watermark' AND NEW.job_id='${accepted.jobId}' BEGIN SELECT RAISE(ABORT, 'injected watermark intermediate consumer failure'); END`,
      );
    await processNext();
    expect(checkedIntermediate).toBe(true);
    expect(
      readGeneratedMediaVersions(connection.db, [job(accepted.jobId)]).get(
        accepted.jobId,
      ),
    ).toEqual(fail ? [] : ['watermark']);
    expect(job(accepted.jobId).status).toBe(fail ? 'failed' : 'succeeded');
    for (const row of before)
      expect(
        versions(asset.imageId).find((value) => value.kind === row.kind),
      ).toEqual(row);
    expect(await bytes(asset.imageId, 'compressed')).toEqual(oldCompressed);
    const intermediate = connection.db
      .select()
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.jobId, accepted.jobId),
          eq(mediaObjects.purpose, 'compressed'),
        ),
      )
      .get()!;
    expect(intermediate).toBeDefined();
    expect(['cleanup_pending', 'cleanup_failed', 'deleted']).toContain(
      intermediate.status,
    );
    await cleanupMediaCandidates(runtime);
    expect(
      connection.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, intermediate.id))
        .get()!.status,
    ).toBe('deleted');
    expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
  },
);

it.each(['disabled', 'deleting'] as const)(
  'rechecks %s after every candidate is stored and before final publication',
  async (condition) => {
    const asset = await accept();
    const before = versions(asset.imageId);
    const accepted = requestReprocess(connection.db, asset.imageId, {});
    const change =
      condition === 'disabled'
        ? 'UPDATE storage_configs SET enabled=0'
        : "UPDATE media_images SET deletion_status='deleting'";
    connection.db.$client.exec(
      `CREATE TRIGGER change_before_final_publish AFTER UPDATE OF status ON media_objects WHEN NEW.status='stored' AND NEW.purpose='thumbnail' AND NEW.job_id='${accepted.jobId}' BEGIN ${change}; END`,
    );
    await processNext();
    expect(job(accepted.jobId)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining(
        condition === 'disabled' ? 'STORAGE_DISABLED' : 'MEDIA_IMAGE_DELETING',
      ),
    });
    expect(versions(asset.imageId)).toEqual(before);
    expect(state(asset.imageId).image.processingStatus).toBe('ready');
    connection.db.update(storageConfigs).set({ enabled: true }).run();
    expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
  },
);

it('preserves saved unpublished candidates and the original snapshot through one transient retry', async () => {
  const asset = await accept();
  const before = versions(asset.imageId);
  patchMediaSettings(connection.db, { quality: 43, maxEdge: 32 });
  const accepted = requestReprocess(connection.db, asset.imageId, {});
  const actualWrite = local.writeObject;
  let failed = false;
  vi.spyOn(local, 'writeObject').mockImplementation(async (...args) => {
    if (!failed && args[2].key.includes('/thumbnail/')) {
      failed = true;
      for await (const chunk of args[3]) void chunk;
      throw Object.assign(
        new Error('injected transient candidate write failure'),
        { code: 'EIO' },
      );
    }
    return actualWrite(...args);
  });
  await processNext();
  expect(job(accepted.jobId)).toMatchObject({
    status: 'queued',
    retryCount: 1,
    snapshot: expect.objectContaining({ quality: 43, maxEdge: 32 }),
  });
  expect(versions(asset.imageId)).toEqual(before);
  const compressed = connection.db
    .select()
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.jobId, accepted.jobId),
        eq(mediaObjects.purpose, 'compressed'),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .get()!;
  expect(compressed).toBeDefined();
  patchMediaSettings(connection.db, { quality: 95, maxEdge: 16 });
  await cleanupMediaCandidates(runtime);
  expect(
    connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, compressed.id))
      .get()!.status,
  ).toBe('stored');
  connection.db
    .update(mediaJobs)
    .set({ nextAttemptAt: new Date(0) })
    .where(eq(mediaJobs.id, accepted.jobId))
    .run();
  await processNext();
  expect(job(accepted.jobId)).toMatchObject({
    status: 'succeeded',
    retryCount: 1,
    snapshot: expect.objectContaining({ quality: 43, maxEdge: 32 }),
  });
  expect(
    versions(asset.imageId).find((row) => row.kind === 'compressed'),
  ).toMatchObject({ objectId: compressed.id, width: 32, height: 24 });
});

it('marks a stored unpublished candidate for exact cleanup when repeated no-progress recovery is exhausted', async () => {
  const asset = await accept();
  const before = versions(asset.imageId);
  const accepted = requestReprocess(connection.db, asset.imageId, {});
  const actualStart = tools.startMediaTool;
  const controller = new AbortController();
  vi.spyOn(tools, 'startMediaTool').mockImplementation(
    (command, args, options) => {
      const compressed = connection.db
        .select()
        .from(mediaObjects)
        .where(
          and(
            eq(mediaObjects.jobId, accepted.jobId),
            eq(mediaObjects.purpose, 'compressed'),
            eq(mediaObjects.status, 'stored'),
          ),
        )
        .get();
      if (
        compressed &&
        command === 'magick' &&
        args.some((arg) => arg.endsWith(':-'))
      )
        controller.abort(
          Object.assign(new Error('injected candidate recovery interruption'), {
            code: 'MEDIA_INTERRUPTED',
          }),
        );
      return actualStart(command, args, options);
    },
  );
  claimNextMediaJob(connection.db);
  await processMediaJob(runtime, accepted.jobId, controller.signal);
  expect(job(accepted.jobId).status).toBe('running');
  const compressed = connection.db
    .select()
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.jobId, accepted.jobId),
        eq(mediaObjects.purpose, 'compressed'),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .get()!;
  expect(compressed).toBeDefined();
  vi.restoreAllMocks();
  for (let attempt = 0; attempt < 3; attempt++) {
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    runtime.db = connection.db;
    recoverMediaJobs(connection.db);
    if (attempt < 2)
      expect(claimNextMediaJob(connection.db)!.id).toBe(accepted.jobId);
  }
  expect(job(accepted.jobId)).toMatchObject({
    status: 'failed',
    retryCount: 0,
    error: expect.stringContaining('MEDIA_RECOVERY_EXHAUSTED'),
  });
  expect(versions(asset.imageId)).toEqual(before);
  expect(state(asset.imageId).image.processingStatus).toBe('ready');
  expect(
    connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, compressed.id))
      .get()!.status,
  ).toBe('cleanup_pending');
  await cleanupMediaCandidates(runtime);
  expect(
    connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, compressed.id))
      .get()!.status,
  ).toBe('deleted');
  expect(await bytes(asset.imageId, 'original')).toEqual(asset.original);
});

it('resets the no-progress budget when watermark-only intermediate compression commits', async () => {
  const asset = await accept();
  const before = versions(asset.imageId);
  patchMediaSettings(connection.db, {
    watermarkMode: 'text',
    watermarkText: 'A',
    watermarkFont: 'latin',
  });
  const accepted = requestReprocess(connection.db, asset.imageId, {
    scope: 'watermark',
  });
  // Persist the exhausted prior-step budget once compression starts; completing
  // that real step must reset it before a later watermark interruption.
  connection.db.$client.exec(
    `CREATE TRIGGER restore_compressed_recovery_budget AFTER UPDATE OF status ON media_objects WHEN NEW.status='writing' AND NEW.purpose='compressed' AND NEW.job_id='${accepted.jobId}' BEGIN UPDATE media_jobs SET recovery_count=2 WHERE id=NEW.job_id; END`,
  );
  const actualStart = tools.startMediaTool;
  const controller = new AbortController();
  let interrupted = false;
  vi.spyOn(tools, 'startMediaTool').mockImplementation(
    (command, args, options) => {
      const compressed = connection.db
        .select()
        .from(mediaObjects)
        .where(
          and(
            eq(mediaObjects.jobId, accepted.jobId),
            eq(mediaObjects.purpose, 'compressed'),
            eq(mediaObjects.status, 'stored'),
          ),
        )
        .get();
      if (
        compressed &&
        command === 'magick' &&
        args.some((arg) => arg.endsWith(':-'))
      ) {
        interrupted = true;
        controller.abort(
          Object.assign(
            new Error(
              'injected watermark-only interruption after compression progress',
            ),
            { code: 'MEDIA_INTERRUPTED' },
          ),
        );
      }
      return actualStart(command, args, options);
    },
  );
  claimNextMediaJob(connection.db);
  await processMediaJob(runtime, accepted.jobId, controller.signal);
  expect(interrupted).toBe(true);
  expect(job(accepted.jobId)).toMatchObject({
    status: 'running',
    step: 'watermark',
    recoveryCount: 0,
  });
  expect(versions(asset.imageId)).toEqual(before);
  vi.restoreAllMocks();
  recoverMediaJobs(connection.db);
  expect(job(accepted.jobId)).toMatchObject({
    status: 'queued',
    recoveryCount: 1,
  });
  await processNext();
  expect(job(accepted.jobId).status).toBe('succeeded');
});
