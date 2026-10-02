import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  createAlbum,
  getOrCreateTags,
  deleteAlbum,
  deleteTag,
} from '../../../src/server/collections/records.ts';
import { addMemberships } from '../../../src/server/collections/memberships.ts';
import {
  albums,
  albumImages,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import {
  parseLibraryBatch,
  runLibraryBatch,
} from '../../../src/server/library/batch.ts';
import type { BatchCommand } from '../../../src/server/library/batch-types.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
  mediaJobs,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());
const run = (
  ids: string[],
  command: BatchCommand,
  query = '',
  mode: 'apply' | 'check' = 'apply',
  onFailure = vi.fn(),
) =>
  runLibraryBatch(
    fixture.db,
    parseLibraryBatch({ ids, command, query, mode }),
    onFailure,
  );
const image = (id: string) =>
  fixture.db.select().from(mediaImages).where(eq(mediaImages.id, id)).get()!;

it('returns changed, unchanged and failed independently, keeps input order and ignores duplicate IDs', async () => {
  fixture.image('change');
  fixture.image('same');
  fixture.image('outside');
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'same'))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, 'outside'))
    .run();
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  const before = image('same');
  const assets = fixture.db.select().from(mediaObjects).all();
  const versions = fixture.db.select().from(mediaVersions).all();
  const jobs = fixture.db.select().from(mediaJobs).all();
  const { results } = await run(
    ['change', 'same', 'missing', 'outside', 'change'],
    { type: 'visibility', visibility: 'private' },
  );
  expect(results).toMatchObject([
    { id: 'change', status: 'changed', inQuery: true },
    { id: 'same', status: 'unchanged', inQuery: true },
    {
      id: 'missing',
      status: 'failed',
      code: 'MEDIA_IMAGE_NOT_FOUND',
      inQuery: false,
    },
    {
      id: 'outside',
      status: 'failed',
      code: 'LIBRARY_IMAGE_OUTSIDE_QUERY',
      inQuery: false,
    },
  ]);
  expect(results.every((item) => item.message.length > 0)).toBe(true);
  expect(image('change').visibility).toBe('private');
  expect(image('same')).toEqual(before);
  expect(fixture.db.select().from(mediaObjects).all()).toEqual(assets);
  expect(fixture.db.select().from(mediaVersions).all()).toEqual(versions);
  expect(fixture.db.select().from(mediaJobs).all()).toEqual(jobs);
});

it('rechecks current filter membership for each image and returns post-command membership', async () => {
  fixture.image('first');
  fixture.image('second');
  const pending = run(
    ['first', 'second'],
    { type: 'visibility', visibility: 'private' },
    'visibility=public',
  );
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'second'))
    .run();
  expect((await pending).results).toMatchObject([
    { id: 'first', status: 'changed', inQuery: false },
    {
      id: 'second',
      status: 'failed',
      code: 'LIBRARY_IMAGE_OUTSIDE_QUERY',
      inQuery: false,
    },
  ]);
  const checked = await run(
    ['first'],
    { type: 'visibility', visibility: 'private' },
    'visibility=public',
    'check',
  );
  expect(checked.results).toMatchObject([
    { id: 'first', status: 'unchanged', inQuery: false },
  ]);
  expect(checked.results[0].message).toContain('核对');
});

it('adds and removes explicit multi-target relations without replacing other joins or original join times', async () => {
  const id = fixture.image('relations');
  const [a, b, c] = fixture.db.transaction((tx) =>
    ['A', 'B', 'C'].map((name) => createAlbum(tx, { name })),
  );
  const [tag, other] = fixture.db.transaction((tx) =>
    getOrCreateTags(tx, ['Tag', 'Other']),
  );
  addMemberships(fixture.db, [id], { albumIds: [a.id], tagIds: [other.id] });
  fixture.db
    .update(albumImages)
    .set({ joinedAt: new Date(1000) })
    .run();
  const oldJoin = fixture.db.select().from(albumImages).get();
  expect(
    (await run([id], { type: 'add-albums', albumIds: [a.id, b.id, c.id] }))
      .results[0].status,
  ).toBe('changed');
  expect(
    (await run([id], { type: 'add-albums', albumIds: [a.id, b.id] })).results[0]
      .status,
  ).toBe('unchanged');
  expect(
    fixture.db
      .select()
      .from(albumImages)
      .where(eq(albumImages.albumId, a.id))
      .get(),
  ).toEqual(oldJoin);
  expect(
    (await run([id], { type: 'add-tags', tagIds: [tag.id, other.id] }))
      .results[0].status,
  ).toBe('changed');
  expect(
    (await run([id], { type: 'add-tags', tagIds: [tag.id] })).results[0].status,
  ).toBe('unchanged');
  fixture.db
    .update(albums)
    .set({ preferredCoverImageId: id })
    .where(eq(albums.id, b.id))
    .run();
  expect(
    (
      await run(
        [id],
        { type: 'remove-albums', albumIds: [b.id, c.id] },
        `scope=album&albumId=${b.id}`,
      )
    ).results[0],
  ).toMatchObject({ status: 'changed', inQuery: false });
  expect(
    fixture.db.select().from(albums).where(eq(albums.id, b.id)).get()!
      .preferredCoverImageId,
  ).toBeNull();
  expect(
    (await run([id], { type: 'remove-albums', albumIds: [b.id, c.id] }))
      .results[0].status,
  ).toBe('unchanged');
  expect(
    (await run([id], { type: 'remove-tags', tagIds: [tag.id] })).results[0]
      .status,
  ).toBe('changed');
  expect(
    (await run([id], { type: 'remove-tags', tagIds: [tag.id] })).results[0]
      .status,
  ).toBe('unchanged');
  expect(fixture.db.select().from(imageTags).all()).toEqual([
    { imageId: id, tagId: other.id },
  ]);
});

it('rolls back all relation targets for a failed image and continues other images with failure diagnostics', async () => {
  fixture.image('failed');
  fixture.image('healthy');
  const [a, b] = fixture.db.transaction((tx) =>
    ['A', 'B'].map((name) => createAlbum(tx, { name })),
  );
  fixture.db.$client.exec(
    `CREATE TRIGGER reject_batch_join BEFORE INSERT ON album_images WHEN NEW.image_id = 'failed' AND NEW.album_id = '${b.id}' BEGIN SELECT RAISE(ABORT, 'injected batch relation failure'); END`,
  );
  const log = vi.fn();
  const response = await run(
    ['failed', 'healthy'],
    { type: 'add-albums', albumIds: [a.id, b.id] },
    '',
    'apply',
    log,
  );
  expect(response.results).toMatchObject([
    {
      id: 'failed',
      status: 'failed',
      code: 'INTERNAL_SERVER_ERROR',
      inQuery: true,
    },
    { id: 'healthy', status: 'changed', inQuery: true },
  ]);
  expect(
    fixture.db
      .select()
      .from(albumImages)
      .where(eq(albumImages.imageId, 'failed'))
      .all(),
  ).toEqual([]);
  expect(
    fixture.db
      .select()
      .from(albumImages)
      .where(eq(albumImages.imageId, 'healthy'))
      .all(),
  ).toHaveLength(2);
  expect(log).toHaveBeenCalledWith(expect.any(Error), 'failed');
});

it('does not partially add or remove when any target is deleted, including between image transactions', async () => {
  fixture.image('first');
  fixture.image('second');
  const [a, b] = fixture.db.transaction((tx) =>
    ['A', 'B'].map((name) => createAlbum(tx, { name })),
  );
  const pending = run(['first', 'second'], {
    type: 'add-albums',
    albumIds: [a.id, b.id],
  });
  fixture.db.transaction((tx) => deleteAlbum(tx, b.id));
  expect((await pending).results).toMatchObject([
    { id: 'first', status: 'changed' },
    {
      id: 'second',
      status: 'failed',
      code: 'COLLECTION_TARGET_NOT_FOUND',
      inQuery: true,
    },
  ]);
  expect(
    fixture.db
      .select()
      .from(albumImages)
      .where(eq(albumImages.imageId, 'second'))
      .all(),
  ).toEqual([]);
  expect(
    (await run(['first'], { type: 'remove-albums', albumIds: [a.id, b.id] }))
      .results[0].status,
  ).toBe('failed');
  expect(
    fixture.db
      .select()
      .from(albumImages)
      .where(eq(albumImages.imageId, 'first'))
      .all(),
  ).toMatchObject([{ albumId: a.id }]);
});

it('checks relationship goals without writing, does not equate deleted targets or images with a successful removal', async () => {
  const id = fixture.image('check');
  const [album] = fixture.db.transaction((tx) => [
    createAlbum(tx, { name: 'A' }),
  ]);
  const [tag] = fixture.db.transaction((tx) => getOrCreateTags(tx, ['Tag']));
  addMemberships(fixture.db, [id], { albumIds: [album.id], tagIds: [tag.id] });
  const before = fixture.db.select().from(albumImages).all();
  for (const command of [
    { type: 'add-albums', albumIds: [album.id] },
    { type: 'add-tags', tagIds: [tag.id] },
  ] as BatchCommand[]) {
    const checked = (await run([id], command, 'visibility=private', 'check'))
      .results[0];
    expect(checked).toMatchObject({ status: 'unchanged', inQuery: false });
    expect(checked.message).toContain('核对');
  }
  expect(
    (await run([id], { type: 'remove-tags', tagIds: [tag.id] }, '', 'check'))
      .results[0],
  ).toMatchObject({ status: 'failed', code: 'LIBRARY_BATCH_NOT_APPLIED' });
  expect(fixture.db.select().from(albumImages).all()).toEqual(before);
  fixture.db.transaction((tx) => deleteTag(tx, tag.id));
  expect(
    (await run([id], { type: 'remove-tags', tagIds: [tag.id] }, '', 'check'))
      .results[0],
  ).toMatchObject({ status: 'failed', code: 'COLLECTION_TARGET_NOT_FOUND' });
  fixture.db.transaction((tx) => {
    tx.delete(mediaJobs).where(eq(mediaJobs.imageId, id)).run();
    tx.delete(mediaVersions).where(eq(mediaVersions.imageId, id)).run();
    tx.delete(mediaObjects).where(eq(mediaObjects.imageId, id)).run();
    tx.delete(mediaImages).where(eq(mediaImages.id, id)).run();
  });
  expect(
    (await run([id], { type: 'trash' }, '', 'check')).results[0],
  ).toMatchObject({
    status: 'failed',
    code: 'MEDIA_IMAGE_NOT_FOUND',
    inQuery: false,
  });
});

it('recycles and restores through media while preserving IDs, visibility, files, jobs and surviving joinedAt', async () => {
  const id = fixture.image('lifecycle');
  const [a, b] = fixture.db.transaction((tx) =>
    ['A', 'B'].map((name) => createAlbum(tx, { name })),
  );
  addMemberships(fixture.db, [id], { albumIds: [a.id, b.id], tagIds: [] });
  fixture.db
    .update(albumImages)
    .set({ joinedAt: new Date(1000) })
    .run();
  const original = image(id);
  const assets = fixture.db.select().from(mediaObjects).all();
  const versions = fixture.db.select().from(mediaVersions).all();
  const jobs = fixture.db.select().from(mediaJobs).all();
  expect((await run([id], { type: 'trash' })).results[0]).toMatchObject({
    status: 'changed',
    inQuery: false,
  });
  expect(
    (await run([id], { type: 'trash' }, '', 'check')).results[0],
  ).toMatchObject({ status: 'unchanged', inQuery: false });
  fixture.db.transaction((tx) => deleteAlbum(tx, b.id));
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  expect(
    (await run([id], { type: 'restore' }, 'scope=trash')).results[0],
  ).toMatchObject({ status: 'changed', inQuery: false });
  expect(
    (await run([id], { type: 'restore' }, 'scope=trash', 'check')).results[0],
  ).toMatchObject({ status: 'unchanged', inQuery: false });
  expect(image(id)).toEqual(original);
  expect(fixture.db.select().from(albumImages).all()).toEqual([
    { albumId: a.id, imageId: id, joinedAt: new Date(1000) },
  ]);
  expect(fixture.db.select().from(mediaObjects).all()).toEqual(assets);
  expect(fixture.db.select().from(mediaVersions).all()).toEqual(versions);
  expect(fixture.db.select().from(mediaJobs).all()).toEqual(jobs);
});

it.each(['deleting', 'cleanup_failed'] as const)(
  'rejects restoring or claiming a confirmed lifecycle result after permanent deletion starts: %s',
  async (deletionStatus) => {
    const id = fixture.image('deletion');
    fixture.db
      .update(mediaImages)
      .set({ trashedAt: new Date(), deletionStatus })
      .run();
    for (const mode of ['apply', 'check'] as const) {
      expect(
        (await run([id], { type: 'restore' }, 'scope=trash', mode)).results[0],
      ).toMatchObject({
        status: 'failed',
        code: 'MEDIA_DELETION_STARTED',
        inQuery: true,
      });
    }
    expect(image(id).deletionStatus).toBe(deletionStatus);
    expect(image(id).trashedAt).not.toBeNull();
  },
);

it('reports stale query references per item and never expands the query to mutate an image', async () => {
  const id = fixture.image('stale');
  expect(
    (
      await run(
        [id],
        { type: 'visibility', visibility: 'private' },
        'albumId=removed',
      )
    ).results[0],
  ).toMatchObject({
    status: 'failed',
    code: 'LIBRARY_STALE_REFERENCE',
    inQuery: false,
  });
  expect(image(id).visibility).toBe('public');
});

it('uses a read-only transaction for outcome checking and leaves unsatisfied goals unchanged', async () => {
  const id = fixture.image('readonly');
  const [album] = fixture.db.transaction((tx) => [
    createAlbum(tx, { name: 'A' }),
  ]);
  fixture.db.$client.pragma('query_only = ON');
  try {
    expect(
      (
        await run(
          [id],
          { type: 'visibility', visibility: 'public' },
          'visibility=private',
          'check',
        )
      ).results[0],
    ).toMatchObject({ status: 'unchanged', inQuery: false });
    expect(
      (
        await run(
          [id],
          { type: 'visibility', visibility: 'private' },
          '',
          'check',
        )
      ).results[0],
    ).toMatchObject({
      status: 'failed',
      code: 'LIBRARY_BATCH_NOT_APPLIED',
      inQuery: true,
    });
    expect(
      (
        await run(
          [id],
          { type: 'remove-albums', albumIds: [album.id] },
          '',
          'check',
        )
      ).results[0],
    ).toMatchObject({ status: 'unchanged', inQuery: true });
    expect(
      (
        await run(
          [id],
          { type: 'add-albums', albumIds: [album.id] },
          '',
          'check',
        )
      ).results[0],
    ).toMatchObject({ status: 'failed', code: 'LIBRARY_BATCH_NOT_APPLIED' });
    expect(image(id).visibility).toBe('public');
    expect(fixture.db.select().from(albumImages).all()).toEqual([]);
  } finally {
    fixture.db.$client.pragma('query_only = OFF');
  }
});
