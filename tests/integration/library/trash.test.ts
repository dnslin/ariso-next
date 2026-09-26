import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseTrashQuery,
  readTrashPage,
} from '../../../src/server/library/trash.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
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
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-trash-list-'));
  mkdirSync(join(directory, 'storage'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function seed(id: string, trashedAt: Date | null = new Date(1000)) {
  connection.db
    .insert(mediaImages)
    .values({
      id,
      storageId: resolveUploadStorage(connection.db).id,
      originalName: `${id}.png`,
      displayName: id,
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 123,
      processingStatus: 'failed',
      trashedAt,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
    .run();
}

it('reads fixed pages in trash-time descending and ID ascending order, retaining real totals beyond the end', () => {
  seed('normal', null);
  for (let index = 0; index < 81; index++)
    seed(`image-${String(index).padStart(3, '0')}`);
  seed('newest', new Date(2000));
  seed('oldest', new Date(0));
  const pages = [1, 2, 3].map((page) => readTrashPage(connection.db, page));
  expect(pages.map((page) => page.items.length)).toEqual([40, 40, 3]);
  expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
  expect(pages.every((page) => page.total === 83 && page.pageSize === 40)).toBe(
    true,
  );
  expect(pages.flatMap((page) => page.items.map((item) => item.id))).toEqual([
    'newest',
    ...Array.from(
      { length: 81 },
      (_, index) => `image-${String(index).padStart(3, '0')}`,
    ),
    'oldest',
  ]);
  expect(readTrashPage(connection.db, 4)).toEqual({
    items: [],
    total: 83,
    page: 4,
    pageSize: 40,
    hasMore: false,
  });
});

it('reads current processing/storage/deletion facts without image content and excludes restored records', () => {
  seed('record');
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  connection.db.update(mediaImages).set({ processingStatus: 'ready' }).run();
  for (const deletionStatus of [null, 'deleting', 'cleanup_failed'] as const) {
    connection.db.update(mediaImages).set({ deletionStatus }).run();
    const record = readTrashPage(connection.db).items[0];
    expect(record).toEqual({
      id: 'record',
      thumbnailPath: null,
      displayName: 'record',
      originalName: 'record.png',
      format: 'PNG',
      byteSize: 123,
      visibility: 'private',
      processingStatus: 'ready',
      trashedAt: new Date(1000).toISOString(),
      deletionStatus,
      storage: {
        id: expect.any(String),
        name: expect.any(String),
        enabled: false,
      },
    });
  }
  connection.db
    .update(mediaImages)
    .set({ trashedAt: null, deletionStatus: null })
    .where(eq(mediaImages.id, 'record'))
    .run();
  expect(readTrashPage(connection.db)).toEqual({
    items: [],
    total: 0,
    page: 1,
    pageSize: 40,
    hasMore: false,
  });
});

it('exposes an owner thumbnail only for an available stored version, including failed images', () => {
  seed('preview');
  expect(readTrashPage(connection.db).items[0].thumbnailPath).toBeNull();
  const storageId = resolveUploadStorage(connection.db).id;
  connection.db
    .insert(mediaObjects)
    .values({
      id: 'thumbnail-object',
      imageId: 'preview',
      storageId,
      key: 'preview.webp',
      purpose: 'thumbnail',
      status: 'stored',
      byteSize: 123,
      format: 'webp',
      mime: 'image/webp',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  connection.db
    .insert(mediaVersions)
    .values({
      imageId: 'preview',
      kind: 'thumbnail',
      objectId: 'thumbnail-object',
      byteSize: 123,
      format: 'webp',
      mime: 'image/webp',
      createdAt: new Date(),
    })
    .run();
  expect(readTrashPage(connection.db).items[0]).toMatchObject({
    processingStatus: 'failed',
    thumbnailPath: '/api/trash/preview/preview?type=thumbnail',
  });
  connection.db.update(mediaObjects).set({ status: 'writing' }).run();
  expect(readTrashPage(connection.db).items[0].thumbnailPath).toBeNull();
  connection.db.update(mediaObjects).set({ status: 'stored' }).run();
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  expect(readTrashPage(connection.db).items[0].thumbnailPath).toBeNull();
  connection.db.update(storageConfigs).set({ enabled: true }).run();
  for (const deletionStatus of ['deleting', 'cleanup_failed'] as const) {
    connection.db.update(mediaImages).set({ deletionStatus }).run();
    expect(readTrashPage(connection.db).items[0].thumbnailPath).toBeNull();
  }
});

it('accepts only one positive integral page within a safe offset', () => {
  expect(parseTrashQuery(new URLSearchParams())).toBe(1);
  expect(parseTrashQuery(new URLSearchParams('page=2'))).toBe(2);
  for (const query of [
    'page=',
    'page=0',
    'page=-1',
    'page=1.5',
    'page=01',
    'page=1e2',
    'page=Infinity',
    'page=9007199254740991',
    'page=1&page=2',
    'pageSize=20',
    'sort=asc',
    'cursor=x',
  ])
    expect(() => parseTrashQuery(new URLSearchParams(query)), query).toThrow(
      '回收站页码无效',
    );
});

describe('owner-only trash HTTP', () => {
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
        const response = await fetch(`${origin}/api/trash`, { headers });
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
          trashedAt: new Date(1000),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      const response = await fetch(`${origin}/api/trash`, {
        headers: { cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        items: [
          {
            id: 'http-private-failed',
            visibility: 'private',
            processingStatus: 'failed',
            trashedAt: new Date(1000).toISOString(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 40,
        hasMore: false,
      });
      expect(
        (
          await fetch(`${origin}/api/trash?page=bad`, {
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
