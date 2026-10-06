import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { publishSharingImage } from '../../../e2e/sharing-public-fixture-images.mjs';
import { createAlbum } from '../../../src/server/collections/records.ts';
import { albumImages } from '../../../src/server/collections/schema.ts';
import { mediaVersions } from '../../../src/server/media/schema.ts';
import { readMediaObjectReferences } from '../../../src/server/media/references.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { scanStorage } from '../../../src/server/storage/scans.ts';
import { collectionFixture } from '../collections/helpers.ts';

const boundary = vi.hoisted(() => ({
  afterCopy: undefined as (() => Promise<void>) | undefined,
  failCopy: false,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...fs,
    copyFile: async (...args: Parameters<typeof fs.copyFile>) => {
      if (boundary.failCopy) throw new Error('fixture copy interrupted');
      await fs.copyFile(...args);
      // The real scanner executes exactly while publication is suspended.
      await boundary.afterCopy?.();
    },
  };
});

let fixture: ReturnType<typeof collectionFixture>;
let albumId: string;
let image: { imageId: string; path: string };
beforeEach(async () => {
  fixture = collectionFixture();
  albumId = fixture.db.transaction((tx) =>
    createAlbum(tx, { name: '夹具生命周期' }),
  ).id;
  const imageId = fixture.image('fixture-image');
  const path = join(
    fixture.storageRoot,
    fixture.storage.localPath!,
    'ariso',
    fixture.storage.id,
    fixture.input(imageId).key,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    await readFile(resolve('tests/fixtures/runtime/images/sample.png')),
  );
  image = { imageId, path };
  boundary.failCopy = false;
  boundary.afterCopy = undefined;
});
afterEach(() => {
  boundary.afterCopy = undefined;
  fixture.close();
});
const publish = () =>
  publishSharingImage({
    db: fixture.db,
    dataDirectory: dirname(fixture.storageRoot),
    storage: fixture.storage,
    image,
    name: '共享照片-001',
    index: 0,
    albumId,
    joinedAt: new Date('2026-10-06T00:00:00Z'),
  });
const scan = () =>
  scanStorage(
    {
      db: fixture.db,
      storageRoot: fixture.storageRoot,
      secretCrypto: createSecretCrypto(Buffer.alloc(32, 1)),
      readReferences: (db, id, key) => ({
        counts: {},
        keys: new Set(
          readMediaObjectReferences(db, id, key!).map((row) => row.key),
        ),
        activeWrites: 0,
      }),
    },
    fixture.storage.id,
  );

it('protects real thumbnail bytes during a scan before version/member publication; intentional missing remains missing', async () => {
  const scans: Awaited<ReturnType<typeof scan>>[] = [];
  boundary.afterCopy = async () => {
    expect(
      fixture.db
        .select()
        .from(mediaVersions)
        .all()
        .map((row) => row.kind),
    ).not.toContain('thumbnail');
    expect(fixture.db.select().from(albumImages).all()).toEqual([]);
    scans.push(await scan());
  };
  const path = await publish();
  expect(scans).toHaveLength(1);
  expect(scans[0]).toMatchObject({
    status: 'passed',
    deletedCount: 0,
    protectedCount: 2,
  });
  expect(await readFile(path)).toEqual(await readFile(image.path));
  expect(
    fixture.db
      .select()
      .from(mediaVersions)
      .all()
      .map((row) => row.kind),
  ).toContain('thumbnail');
  expect(fixture.db.select().from(albumImages).all()).toMatchObject([
    { albumId, imageId: image.imageId },
  ]);
  expect(fixture.db.$client.pragma('foreign_key_check')).toEqual([]);
  await rm(path);
  expect(await scan()).toMatchObject({ status: 'passed', deletedCount: 0 });
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('does not publish a version or album member when the real file copy is interrupted', async () => {
  boundary.failCopy = true;
  await expect(publish()).rejects.toThrow('fixture copy interrupted');
  expect(
    fixture.db
      .select()
      .from(mediaVersions)
      .all()
      .map((row) => row.kind),
  ).not.toContain('thumbnail');
  expect(fixture.db.select().from(albumImages).all()).toEqual([]);
  expect(fixture.db.$client.pragma('foreign_key_check')).toEqual([]);
});
