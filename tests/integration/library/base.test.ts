import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseLibraryQuery,
  readLibraryPage,
} from '../../../src/server/library/queries.ts';
import {
  albums,
  albumImages,
  tags,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  prepareInitialMedia,
  createProcessingSnapshot,
} from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
function seed(id: string, createdAt = new Date(1000)) {
  const storage = resolveUploadStorage(connection.db);
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: id,
      storageId: storage.id,
      key: `private-key/${id}`,
      originalName: `${id}.png`,
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 123,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['thumbnail'],
    }),
  );
  connection.db
    .update(mediaImages)
    .set({ createdAt })
    .where(eq(mediaImages.id, id))
    .run();
  return accepted;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-library-'));
  mkdirSync(join(directory, 'storage'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction((tx) => prepareInitialMedia(tx));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('paginates equal timestamps without duplicates and preserves a deleted boundary value', () => {
  for (let i = 0; i < 85; i++) seed(`image-${String(i).padStart(3, '0')}`);
  seed('newest', new Date(2000));
  seed('oldest', new Date(0));
  const first = readLibraryPage(connection.db);
  expect(first.total).toBe(87);
  expect(first.items).toHaveLength(40);
  expect(first.items[0].id).toBe('newest');
  const boundary = first.items.at(-1)!.id;
  connection.db
    .update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, boundary))
    .run();
  const second = readLibraryPage(
    connection.db,
    parseLibraryQuery(new URLSearchParams({ cursor: first.nextCursor! })),
  );
  const third = readLibraryPage(
    connection.db,
    parseLibraryQuery(new URLSearchParams({ cursor: second.nextCursor! })),
  );
  expect(second.total).toBe(86);
  expect(third.hasMore).toBe(false);
  expect(third.nextCursor).toBeNull();
  expect(
    [...first.items, ...second.items, ...third.items].map((item) => item.id),
  ).toEqual([
    'newest',
    ...Array.from(
      { length: 85 },
      (_, i) => `image-${String(i).padStart(3, '0')}`,
    ),
    'oldest',
  ]);
});

it('keeps mixed states and stored versions independent from storage and reprocessing jobs', () => {
  const accepted = seed('mixed');
  const original = connection.db.select().from(mediaObjects).get()!;
  connection.db
    .insert(mediaObjects)
    .values({
      ...original,
      id: 'thumb',
      key: 'secret/thumbnail',
      purpose: 'thumbnail',
      status: 'writing',
    })
    .run();
  connection.db
    .insert(mediaVersions)
    .values({
      imageId: 'mixed',
      kind: 'thumbnail',
      objectId: 'thumb',
      byteSize: 20,
      format: 'WEBP',
      mime: 'image/webp',
      createdAt: new Date(),
    })
    .run();
  const job = connection.db.select().from(mediaJobs).get()!;
  connection.db
    .update(mediaJobs)
    .set({ status: 'failed', error: 'identify failed' })
    .where(eq(mediaJobs.id, accepted.jobId))
    .run();
  connection.db
    .insert(mediaJobs)
    .values({
      ...job,
      id: 'new-failure',
      status: 'failed',
      error: 'thumbnail failed',
    })
    .run();
  connection.db
    .insert(mediaJobs)
    .values({ ...job, id: 'active', status: 'running' })
    .run();
  connection.db.update(mediaImages).set({ processingStatus: 'ready' }).run();
  let item = readLibraryPage(connection.db).items[0];
  expect(item).toMatchObject({
    visibility: 'private',
    processingStatus: 'ready',
    versions: { original: true, thumbnail: false },
    thumbnailUrl: null,
    activeJob: { id: 'active' },
    latestFailedJob: { id: 'new-failure', error: 'thumbnail failed' },
  });
  connection.db
    .update(mediaObjects)
    .set({ status: 'stored' })
    .where(eq(mediaObjects.id, 'thumb'))
    .run();
  expect(readLibraryPage(connection.db).items[0].thumbnailUrl).toBe(
    '/i/mixed?type=thumbnail',
  );
  for (const status of ['pending', 'processing', 'failed'] as const) {
    connection.db.update(mediaImages).set({ processingStatus: status }).run();
    expect(readLibraryPage(connection.db).items[0]).toMatchObject({
      processingStatus: status,
      versions: { thumbnail: true },
      thumbnailUrl: '/i/mixed?type=thumbnail',
    });
  }
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  item = readLibraryPage(connection.db).items[0];
  expect(item.versions.thumbnail).toBe(true);
  expect(item.thumbnailUrl).toBeNull();
  expect(JSON.stringify(item)).not.toMatch(
    /private-key|secret|localPath|snapshot|objectId/,
  );
  connection.db.update(mediaImages).set({ trashedAt: new Date() }).run();
  expect(readLibraryPage(connection.db)).toEqual({
    items: [],
    total: 0,
    nextCursor: null,
    hasMore: false,
  });
});

it('counts each image once despite multiple album and tag memberships', () => {
  seed('many-relations');
  seed('no-relations');
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const id = `relation-${i}`;
    connection.db
      .insert(albums)
      .values({ id, name: id, description: '', createdAt: now, updatedAt: now })
      .run();
    connection.db
      .insert(albumImages)
      .values({ albumId: id, imageId: 'many-relations', joinedAt: now })
      .run();
    connection.db
      .insert(tags)
      .values({
        id,
        displayName: id,
        normalizedKey: id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    connection.db
      .insert(imageTags)
      .values({ tagId: id, imageId: 'many-relations' })
      .run();
  }
  const result = readLibraryPage(connection.db);
  expect(result.total).toBe(2);
  expect(result.items.map((item) => item.id)).toEqual([
    'many-relations',
    'no-relations',
  ]);
  expect(result.hasMore).toBe(false);
  expect(result.nextCursor).toBeNull();
});

it('rejects unsupported, duplicate, malformed, and mismatched query cursors', () => {
  for (const query of [
    'q=test',
    'pageSize=20',
    'sort=uploaded_asc',
    'cursor=',
    'cursor=x&cursor=y',
    'cursor=garbage',
  ])
    expect(() => parseLibraryQuery(new URLSearchParams(query))).toThrow();
  for (const overrides of [
    { scope: 'trash' },
    { sort: 'uploaded_asc' },
    { pageSize: 80 },
    { createdAt: 1e20 },
    { id: '' },
    { q: 'test' },
  ]) {
    const cursor = Buffer.from(
      JSON.stringify({
        scope: 'library',
        sort: 'uploaded_desc',
        pageSize: 40,
        createdAt: 1,
        id: 'x',
        ...overrides,
      }),
    ).toString('base64url');
    expect(() => parseLibraryQuery(new URLSearchParams({ cursor }))).toThrow();
  }
});

describe('owner-only list HTTP', () => {
  it('rejects anonymous and bearer reads, returns real owner data, and rejects invalid queries', async () => {
    const env = {
      DATA_DIR: join(directory, 'http-data'),
      HOST: '127.0.0.1',
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    };
    const server = await launch(resolve('.next/standalone'), directory, env);
    let live: ReturnType<typeof openRuntimeDatabase> | undefined;
    try {
      const origin = `http://127.0.0.1:${server.port}`;
      await vi.waitFor(
        async () => {
          if (server.child.exitCode !== null) throw new Error(server.logs());
          expect((await fetch(`${origin}/api/health`)).status).toBe(200);
        },
        { timeout: 15000 },
      );
      live = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
      await seedAuthOwner(live, origin);
      const login = await fetch(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const token = (await login.json()).token;
      for (const headers of [
        {},
        { authorization: `Bearer ${token}` },
        { cookie: `ariso.share_token=${token}` },
      ] as Record<string, string>[]) {
        const response = await fetch(`${origin}/api/images`, { headers });
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      const storage = resolveUploadStorage(live.db);
      live.db
        .insert(mediaImages)
        .values({
          id: 'http-private-failed',
          storageId: storage.id,
          originalName: '私有.png',
          displayName: '私有',
          visibility: 'private',
          format: 'PNG',
          mime: 'image/png',
          byteSize: 42,
          processingStatus: 'failed',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      const response = await fetch(`${origin}/api/images`, {
        headers: { cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        items: [
          {
            id: 'http-private-failed',
            visibility: 'private',
            processingStatus: 'failed',
            thumbnailUrl: null,
          },
        ],
        total: 1,
        nextCursor: null,
        hasMore: false,
      });
      expect(
        (
          await fetch(`${origin}/api/images?cursor=bad`, {
            headers: { cookie },
          })
        ).status,
      ).toBe(400);
    } finally {
      live?.close();
      await stop(server.child, server.closed);
    }
  }, 30000);
});
