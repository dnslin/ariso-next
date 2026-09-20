import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
  readObject,
} from '../../../src/server/storage/local.ts';
import {
  acceptOriginal,
  getImageAccessState,
  type AcceptOriginalInput,
} from '../../../src/server/media/images.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';

let directory: string;
let storageRoot: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let input: AcceptOriginalInput;
const bytes = readFileSync(resolve('tests/fixtures/runtime/images/sample.png'));
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-media-'));
  storageRoot = join(directory, 'storage');
  mkdirSync(storageRoot);
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: storageRoot });
  const storage = resolveUploadStorage(connection.db);
  const write = planLocalWrite('uploads');
  // Test-only owner stands in for upload, which is delivered by T-UP-01.
  connection.db.$client.exec(
    'CREATE TABLE upload_owner (key TEXT PRIMARY KEY, temporary_key TEXT NOT NULL)',
  );
  connection.db.$client
    .prepare('INSERT INTO upload_owner VALUES (?, ?)')
    .run(write.key, write.temporaryKey);
  await writeObject(storageRoot, storage, write, Readable.from(bytes));
  input = {
    imageId: randomUUID(),
    storageId: storage.id,
    key: write.key,
    originalName: '旅行.final.PNG',
    visibility: 'private',
    format: 'PNG',
    mime: 'image/png',
    byteSize: bytes.length,
    width: 64,
    height: 48,
    animated: false,
    pageCount: 1,
    classification: 'static',
    snapshot: { compression: { enabled: true, quality: 82 }, watermark: null },
    expectedVersions: ['compressed', 'thumbnail'],
  };
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const accept = () =>
  connection.db.transaction((tx) => acceptOriginal(tx, input));
const state = () => getImageAccessState(connection.db, input.imageId)!;
async function originalBytes() {
  const object = await readObject(
    storageRoot,
    resolveUploadStorage(connection.db),
    input.key,
    input.mime,
  );
  const chunks = [];
  for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('T-MED-01 persistent asset contract', () => {
  it('accepts identical bytes twice as separate images and preserves original bytes through reopen', async () => {
    const first = accept();
    const secondPlan = planLocalWrite('uploads');
    connection.db.$client
      .prepare('INSERT INTO upload_owner VALUES (?, ?)')
      .run(secondPlan.key, secondPlan.temporaryKey);
    await writeObject(
      storageRoot,
      resolveUploadStorage(connection.db),
      secondPlan,
      Readable.from(bytes),
    );
    const second = connection.db.transaction((tx) =>
      acceptOriginal(tx, {
        ...input,
        imageId: randomUUID(),
        key: secondPlan.key,
      }),
    );
    expect(second.imageId).not.toBe(first.imageId);
    expect(connection.db.select().from(mediaImages).all()).toHaveLength(2);
    expect(state().image).toMatchObject({
      displayName: '旅行.final',
      originalName: input.originalName,
      processingStatus: 'pending',
      trashedAt: null,
      deletionStatus: null,
    });
    expect(state().latestJob).toMatchObject({
      id: first.jobId,
      status: 'queued',
      snapshot: input.snapshot,
      expectedVersions: input.expectedVersions,
    });
    input.snapshot.compression = false;
    expect(state().latestJob!.snapshot.compression).toEqual({
      enabled: true,
      quality: 82,
    });
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    expect(
      state().versions.find((v) => v.kind === 'original')!.saved!.object.key,
    ).toBe(input.key);
    expect(await originalBytes()).toEqual(bytes);
    expect(() => accept()).toThrow();
    expect(connection.db.select().from(mediaImages).all()).toHaveLength(2);
  });

  it.each(['plain', '.photo', 'photo.', '旅行.final.PNG', ''])(
    'derives the initial display name for %j',
    (name) => {
      input.originalName = name;
      accept();
      expect(state().image.displayName).toBe(
        {
          plain: 'plain',
          '.photo': '.photo',
          'photo.': 'photo',
          '旅行.final.PNG': '旅行.final',
          '': 'image',
        }[name],
      );
    },
  );

  it.each(['media_objects', 'media_versions', 'media_jobs'])(
    'rolls back the whole handoff on %s failure without touching owner or bytes',
    async (table) => {
      connection.db.$client.exec(
        `CREATE TRIGGER interrupt BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'handoff interrupted'); END`,
      );
      expect(() =>
        connection.db.transaction((tx) => {
          tx.run('DELETE FROM upload_owner');
          acceptOriginal(tx, input);
        }),
      ).toThrow('handoff interrupted');
      for (const table of [mediaImages, mediaObjects, mediaVersions, mediaJobs])
        expect(connection.db.select().from(table).all()).toEqual([]);
      expect(
        connection.db.$client.prepare('SELECT key FROM upload_owner').get(),
      ).toEqual({ key: input.key });
      expect(await originalBytes()).toEqual(bytes);
    },
  );

  it('rolls back media when the later caller operation fails, then transfers ownership together on retry', () => {
    expect(() =>
      connection.db.transaction((tx) => {
        acceptOriginal(tx, input);
        tx.run('DELETE FROM upload_owner');
        throw new Error('association disappeared');
      }),
    ).toThrow('association disappeared');
    expect(getImageAccessState(connection.db, input.imageId)).toBeNull();
    expect(
      connection.db.$client
        .prepare('SELECT count(*) AS count FROM upload_owner')
        .get(),
    ).toEqual({ count: 1 });
    connection.db.transaction((tx) => {
      acceptOriginal(tx, input);
      tx.run('DELETE FROM upload_owner');
    });
    expect(state().image.id).toBe(input.imageId);
    expect(
      connection.db.$client
        .prepare('SELECT count(*) AS count FROM upload_owner')
        .get(),
    ).toEqual({ count: 0 });
  });

  it('enforces unique current kinds, object keys, storage references and image/object ownership', () => {
    const accepted = accept();
    const version = connection.db.select().from(mediaVersions).get()!;
    expect(() =>
      connection.db.insert(mediaVersions).values(version).run(),
    ).toThrow('UNIQUE');
    const object = connection.db.select().from(mediaObjects).get()!;
    expect(() =>
      connection.db
        .insert(mediaObjects)
        .values({ ...object, id: randomUUID() })
        .run(),
    ).toThrow('UNIQUE');
    expect(() =>
      connection.db.transaction((tx) =>
        acceptOriginal(tx, {
          ...input,
          imageId: randomUUID(),
          storageId: 'missing',
          key: 'new',
        }),
      ),
    ).toThrow('FOREIGN KEY');
    const other = connection.db.transaction((tx) =>
      acceptOriginal(tx, { ...input, imageId: randomUUID(), key: 'other' }),
    );
    expect(() =>
      connection.db
        .update(mediaVersions)
        .set({ objectId: accepted.objectId })
        .where(eq(mediaVersions.imageId, other.imageId))
        .run(),
    ).toThrow('FOREIGN KEY');
    expect(() =>
      connection.db
        .insert(mediaVersions)
        .values({ ...version, kind: 'thumbnail' })
        .run(),
    ).toThrow('FOREIGN KEY');
  });

  it('keeps rename, processing, trash and deletion independent from the original', async () => {
    accept();
    const original = state().versions[0];
    connection.db
      .update(mediaImages)
      .set({
        displayName: 'renamed',
        processingStatus: 'failed',
        trashedAt: new Date(1000),
        deletionStatus: 'cleanup_failed',
      })
      .run();
    expect(state().image).toMatchObject({
      originalName: input.originalName,
      displayName: 'renamed',
      processingStatus: 'failed',
      trashedAt: new Date(1000),
      deletionStatus: 'cleanup_failed',
    });
    expect(state().versions[0]).toEqual(original);
    connection.db.update(mediaImages).set({ trashedAt: null }).run();
    expect(state().image).toMatchObject({
      processingStatus: 'failed',
      trashedAt: null,
      deletionStatus: 'cleanup_failed',
    });
    expect(await originalBytes()).toEqual(bytes);
  });

  it('persists both planned keys before I/O and does not expose uncommitted or unstored versions', () => {
    const accepted = accept();
    const plan = connection.db.transaction((tx) =>
      planDerivedObject(tx, accepted.jobId, 'thumbnail'),
    );
    const observer = openRuntimeDatabase(join(directory, 'ariso.db'));
    try {
      const planned = observer.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.jobId, accepted.jobId))
        .all();
      expect(planned.map((o) => [o.key, o.status])).toEqual([
        [plan.key, 'planned'],
        [plan.temporaryKey, 'planned'],
      ]);
      const version = {
        imageId: input.imageId,
        kind: 'thumbnail' as const,
        objectId: plan.objectId,
        byteSize: 123,
        format: 'WEBP',
        mime: 'image/webp',
        width: 64,
        height: 48,
        createdAt: new Date(),
      };
      connection.db.insert(mediaVersions).values(version).run();
      expect(
        state().versions.find((v) => v.kind === 'thumbnail')!.saved,
      ).toBeNull();
      connection.db
        .update(mediaObjects)
        .set({
          status: 'stored',
          byteSize: 123,
          format: 'WEBP',
          mime: 'image/webp',
        })
        .where(eq(mediaObjects.id, plan.objectId))
        .run();
      expect(
        state().versions.find((v) => v.kind === 'thumbnail')!.saved!.version,
      ).toEqual(version);
      expect(() =>
        connection.db.transaction((tx) => {
          planDerivedObject(tx, accepted.jobId, 'compressed');
          throw new Error('stop');
        }),
      ).toThrow('stop');
      expect(observer.db.select().from(mediaObjects).all()).toHaveLength(3);
    } finally {
      observer.close();
    }
  });

  it('returns the last submitted job when two jobs share a timestamp', () => {
    accept();
    const first = connection.db.select().from(mediaJobs).get()!;
    connection.db
      .insert(mediaJobs)
      .values({
        ...first,
        id: '000-last-job',
        status: 'failed',
        error: 'latest failure',
        expectedVersions: ['thumbnail'],
      })
      .run();
    expect(state().latestJob).toMatchObject({
      id: '000-last-job',
      error: 'latest failure',
      expectedVersions: ['thumbnail'],
    });
  });

  it('distinguishes unknown/inapplicable/missing/saved versions from the latest task result', () => {
    accept();
    expect(getImageAccessState(connection.db, 'missing')).toBeNull();
    expect(state().versions.find((v) => v.kind === 'compressed')).toMatchObject(
      { applicable: true, saved: null },
    );
    connection.db.update(mediaImages).set({ classification: 'animated' }).run();
    connection.db
      .update(mediaJobs)
      .set({ status: 'failed', error: 'decode failed' })
      .run();
    expect(state().versions.find((v) => v.kind === 'compressed')).toMatchObject(
      { applicable: false, saved: null },
    );
    expect(state().latestJob).toMatchObject({
      status: 'failed',
      error: 'decode failed',
      expectedVersions: input.expectedVersions,
    });
    connection.db.update(mediaImages).set({ classification: null }).run();
    expect(
      state().versions.find((v) => v.kind === 'compressed')!.applicable,
    ).toBeNull();
    expect(
      state().versions.find((v) => v.kind === 'original')!.saved,
    ).not.toBeNull();
  });
});
