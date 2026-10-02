import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readLibraryPage,
  readLibraryNeighbors,
  readLibraryStatus,
} from '../../../src/server/library/queries.ts';
import { parseLibraryQuery } from '../../../src/server/library/query-schema.ts';
import { getImageAccessState } from '../../../src/server/media/images.ts';
import { readLibraryDetail } from '../../../src/server/library/detail.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import {
  albums,
  albumImages,
  tags,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaSettings,
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  mediaMetadata,
} from '../../../src/server/media/schema.ts';
import {
  prepareInitialMedia,
  createProcessingSnapshot,
} from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
function seed(id: string, createdAt = new Date(1000)) {
  const storage = resolveLocalUploadStorage(connection.db);
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
  connection.db
    .insert(siteSettings)
    .values({
      publicUrl: 'https://images.example.test',
      timeZone: 'UTC',
      updatedAt: new Date(),
    })
    .run();
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('returns actual saved versions, relationships and separate task summaries without internal storage data', () => {
  seed('detail');
  const now = new Date();
  connection.db
    .update(mediaImages)
    .set({
      classification: 'static',
      processingStatus: 'ready',
      width: 1000,
      height: 800,
    })
    .run();
  connection.db
    .insert(albums)
    .values({
      id: 'a',
      name: '相册',
      description: '',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  connection.db
    .insert(albumImages)
    .values({ albumId: 'a', imageId: 'detail', joinedAt: now })
    .run();
  connection.db
    .insert(tags)
    .values({
      id: 't',
      displayName: '标签',
      normalizedKey: '标签',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  connection.db
    .insert(imageTags)
    .values({ tagId: 't', imageId: 'detail' })
    .run();
  const original = connection.db.select().from(mediaObjects).get()!;
  connection.db
    .insert(mediaObjects)
    .values({
      ...original,
      id: 'compressed',
      key: 'secret/compressed',
      purpose: 'compressed',
    })
    .run();
  connection.db
    .insert(mediaVersions)
    .values({
      imageId: 'detail',
      kind: 'compressed',
      objectId: 'compressed',
      width: 500,
      height: 400,
      byteSize: 31,
      format: 'WEBP',
      mime: 'image/webp',
      createdAt: now,
    })
    .run();
  const job = connection.db.select().from(mediaJobs).get()!;
  connection.db
    .update(mediaJobs)
    .set({ status: 'failed', error: 'first failure' })
    .run();
  connection.db
    .insert(mediaJobs)
    .values({
      ...job,
      id: 'latest-failure',
      status: 'failed',
      error: 'watermark failed',
      step: 'watermark',
    })
    .run();
  connection.db
    .insert(mediaJobs)
    .values({ ...job, id: 'active', status: 'running' })
    .run();
  const detail = readLibraryDetail(connection.db, 'detail');
  expect(detail).toMatchObject({
    albums: [{ id: 'a', name: '相册' }],
    tags: [{ id: 't', displayName: '标签' }],
    activeJob: { id: 'active' },
    latestFailedJob: { id: 'latest-failure', error: 'watermark failed' },
    processingStatus: 'ready',
  });
  expect(detail.versions.find((v) => v.kind === 'compressed')).toMatchObject({
    saved: true,
    width: 500,
    height: 400,
    byteSize: 31,
    format: 'WEBP',
    previewPath: '/i/detail?type=compressed',
    downloadPath: '/i/detail?type=compressed&download=1',
    links: { url: 'https://images.example.test/i/detail?type=compressed' },
  });
  expect(JSON.stringify(detail)).not.toMatch(
    /private-key|secret|localPath|snapshot|objectId/,
  );
});

it('keeps default links dynamic, fixed links explicit, and reports missing default versions', () => {
  seed('links');
  connection.db
    .update(mediaImages)
    .set({ classification: 'static', displayName: 'a"<&[b]' })
    .run();
  connection.db
    .update(mediaSettings)
    .set({ defaultLinkVersion: 'original' })
    .run();
  const detail = readLibraryDetail(connection.db, 'links');
  expect(detail.defaultLink).toMatchObject({
    actualVersion: 'original',
    downloadPath: '/i/links?download=1',
    links: {
      url: 'https://images.example.test/i/links',
      downloadUrl: 'https://images.example.test/i/links?download=1',
    },
  });
  expect(detail.defaultLink.links!.html).toContain('alt="a&quot;&lt;&amp;[b]"');
  expect(detail.defaultLink.links!.markdown).toContain('\\[b\\]');
  connection.db
    .update(mediaSettings)
    .set({ defaultLinkVersion: 'watermark' })
    .run();
  expect(readLibraryDetail(connection.db, 'links').defaultLink).toMatchObject({
    actualVersion: null,
    links: null,
  });
  connection.db
    .update(mediaImages)
    .set({ classification: 'animated', animated: true, format: 'GIF' })
    .run();
  expect(readLibraryDetail(connection.db, 'links').defaultLink).toMatchObject({
    actualVersion: 'original',
    links: { url: detail.defaultLink.links!.url },
  });
});

it('encodes all fixed and default copy formats independently of display-name punctuation', () => {
  const id = '图片 ?#%&';
  seed(id);
  connection.db
    .update(mediaImages)
    .set({ classification: 'static', displayName: '图[一]"<&\r\n行' })
    .run();
  const object = connection.db.select().from(mediaObjects).get()!;
  const original = connection.db.select().from(mediaVersions).get()!;
  for (const kind of ['compressed', 'thumbnail', 'watermark'] as const) {
    connection.db
      .insert(mediaObjects)
      .values({ ...object, id: kind, key: `versions/${kind}`, purpose: kind })
      .run();
    connection.db
      .insert(mediaVersions)
      .values({ ...original, kind, objectId: kind })
      .run();
  }
  const base =
    'https://images.example.test/i/%E5%9B%BE%E7%89%87%20%3F%23%25%26';
  for (const defaultLinkVersion of [
    'original',
    'compressed',
    'watermark',
  ] as const) {
    connection.db.update(mediaSettings).set({ defaultLinkVersion }).run();
    const detail = readLibraryDetail(connection.db, id);
    expect(detail.defaultLink.actualVersion).toBe(defaultLinkVersion);
    const modes = [
      {
        links: detail.defaultLink.links,
        url: base,
        downloadUrl: `${base}?download=1`,
      },
      ...detail.versions.map((version) => ({
        links: version.links,
        url: `${base}?type=${version.kind}`,
        downloadUrl: `${base}?type=${version.kind}&download=1`,
      })),
    ];
    expect(modes).toHaveLength(5);
    for (const { links, url, downloadUrl } of modes) {
      expect(links).toEqual({
        url,
        markdown: `![图\\[一\\]"\\<&  行](<${url}>)`,
        html: `<img src="${url}" alt="图[一]&quot;&lt;&amp;&#13;&#10;行">`,
        downloadUrl,
      });
      expect(new URL(links!.url).pathname).toBe(new URL(base).pathname);
    }
  }
});

it('allows owner trash preview while suppressing copy/download, disabled, missing and candidate content', () => {
  const { objectId } = seed('states');
  connection.db.update(mediaImages).set({ processingStatus: 'failed' }).run();
  expect(
    readLibraryDetail(connection.db, 'states').versions[0].links,
  ).not.toBeNull();
  connection.db.update(storageConfigs).set({ enabled: false }).run();
  let detail = readLibraryDetail(connection.db, 'states');
  expect(detail.versions[0]).toMatchObject({
    saved: true,
    links: null,
    downloadPath: null,
    previewPath: null,
    unavailableReason: '存储已停用',
  });
  connection.db.update(storageConfigs).set({ enabled: true }).run();
  connection.db.update(mediaImages).set({ trashedAt: new Date() }).run();
  detail = readLibraryDetail(connection.db, 'states');
  expect(detail.trashedAt).not.toBeNull();
  expect(detail.versions.every((v) => !v.links && !v.downloadPath)).toBe(true);
  expect(detail.versions[0]).toMatchObject({
    previewPath: '/api/trash/states/preview?type=original',
    unavailableReason: null,
  });
  expect(detail.defaultLink.links).toBeNull();
  connection.db.update(mediaImages).set({ deletionStatus: 'deleting' }).run();
  expect(
    readLibraryDetail(connection.db, 'states').versions[0].previewPath,
  ).toBeNull();
  connection.db
    .update(mediaImages)
    .set({ deletionStatus: 'cleanup_failed' })
    .run();
  expect(readLibraryDetail(connection.db, 'states').versions[0]).toMatchObject({
    previewPath: null,
    unavailableReason: '图片清理失败，无法预览',
  });
  connection.db
    .update(mediaImages)
    .set({ trashedAt: null, deletionStatus: null })
    .run();
  connection.db
    .update(mediaObjects)
    .set({ status: 'writing' })
    .where(eq(mediaObjects.id, objectId))
    .run();
  expect(readLibraryDetail(connection.db, 'states').versions[0]).toMatchObject({
    saved: false,
    links: null,
  });
  expect(() => readLibraryDetail(connection.db, 'missing')).toThrow(
    '图片不存在',
  );
});

it('offers SVG originals as attachments without an inline preview', () => {
  seed('svg');
  connection.db
    .update(mediaVersions)
    .set({ format: 'SVG', mime: 'image/svg+xml' })
    .run();
  expect(readLibraryDetail(connection.db, 'svg').versions[0]).toMatchObject({
    previewPath: null,
    downloadPath: '/i/svg?type=original&download=1',
  });
});

describe('owner-only detail HTTP', () => {
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
        const response = await fetch(
          `${origin}/api/images/http-private-failed`,
          { headers },
        );
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      const storage = resolveLocalUploadStorage(live.db);
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
      const response = await fetch(`${origin}/api/images/http-private-failed`, {
        headers: { cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: 'http-private-failed',
        visibility: 'private',
        processingStatus: 'failed',
        defaultLink: { links: null },
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      const id = 'http-private-failed';
      for (const headers of [
        {},
        { authorization: `Bearer ${token}` },
      ] as Record<string, string>[]) {
        const unauthenticated = await fetch(
          `${origin}/api/images/${id}/metadata`,
          { headers },
        );
        expect(unauthenticated.status).toBe(401);
        expect(unauthenticated.headers.get('cache-control')).toBe('no-store');
        for (const path of [
          `/api/images/${id}`,
          `/api/images/${id}/collections`,
        ]) {
          const rejected = await fetch(`${origin}${path}`, {
            method: 'PATCH',
            headers: { ...headers, origin, 'content-type': 'application/json' },
            body: '{}',
          });
          expect(rejected.status).toBe(401);
          expect(rejected.headers.get('cache-control')).toBe('no-store');
        }
      }
      let metadata = await fetch(`${origin}/api/images/${id}/metadata`, {
        headers: { cookie },
      });
      expect(metadata.status).toBe(200);
      expect(await metadata.json()).toBeNull();
      const data = {
        'ExifIFD:Main:SerialNumber': '12345678901234567890',
        'XMP:Main:Version': '1.10',
        'XMP:Main:Nested': { value: ['a', 'b', { text: '<private>&' }] },
        'GPS:Main:GPSLatitude': '30.0',
      };
      live.db
        .insert(mediaMetadata)
        .values({
          imageId: id,
          status: 'failed',
          data,
          readAt: new Date(1000),
          attemptedAt: new Date(2000),
          error: 'ExifTool timeout',
        })
        .run();
      live.db.update(storageConfigs).set({ enabled: false }).run();
      metadata = await fetch(`${origin}/api/images/${id}/metadata`, {
        headers: { cookie },
      });
      expect(metadata.status).toBe(200);
      expect(await metadata.json()).toMatchObject({
        imageId: id,
        data,
        status: 'failed',
        historical: true,
        error: 'ExifTool timeout',
        readAt: new Date(1000).toISOString(),
        attemptedAt: new Date(2000).toISOString(),
      });
      const patch = (path: string, body: string, requestOrigin = origin) =>
        fetch(`${origin}${path}`, {
          method: 'PATCH',
          headers: {
            cookie,
            origin: requestOrigin,
            'content-type': 'application/json',
          },
          body,
        });
      for (const path of [
        `/api/images/${id}`,
        `/api/images/${id}/collections`,
      ]) {
        expect((await patch(path, '{}', 'https://foreign.test')).status).toBe(
          403,
        );
        expect((await patch(path, '{}')).status).toBe(400);
        expect((await patch(path, '{')).status).toBe(400);
      }
      for (const input of [
        { displayName: ' ' },
        { displayName: '\nname' },
        { displayName: '😀'.repeat(256) },
        { originalName: 'overwrite' },
        { visibility: 'other' },
      ])
        expect(
          (await patch(`/api/images/${id}`, JSON.stringify(input))).status,
        ).toBe(400);
      let saved = await patch(
        `/api/images/${id}`,
        JSON.stringify({ displayName: ' 新名称.png ', visibility: 'public' }),
      );
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({
        id,
        displayName: '新名称.png',
        originalName: '私有.png',
        visibility: 'public',
        storage: { enabled: false },
        actions: { editUnavailableReason: null },
      });
      const now = new Date();
      live.db
        .insert(albums)
        .values({
          id: 'http-album',
          name: '关系相册',
          description: '',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      saved = await patch(
        `/api/images/${id}/collections`,
        JSON.stringify({ albumIds: ['http-album'] }),
      );
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({
        albums: [{ id: 'http-album', name: '关系相册' }],
      });
      expect(
        (
          await patch(
            `/api/images/${id}/collections`,
            JSON.stringify({ albumIds: ['missing'] }),
          )
        ).status,
      ).toBe(409);
      expect(live.db.select().from(albumImages).all()).toMatchObject([
        { imageId: id, albumId: 'http-album' },
      ]);
      live.db
        .update(mediaImages)
        .set({ trashedAt: new Date() })
        .where(eq(mediaImages.id, id))
        .run();
      expect(
        (
          await patch(
            `/api/images/${id}`,
            JSON.stringify({ displayName: '不可写' }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await patch(
            `/api/images/${id}/collections`,
            JSON.stringify({ albumIds: [] }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await fetch(`${origin}/api/images/${id}/metadata`, {
            headers: { cookie },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(`${origin}/api/images/missing/metadata`, {
            headers: { cookie },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await patch(
            '/api/images/missing',
            JSON.stringify({ displayName: 'missing' }),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await patch(
            '/api/images/missing/collections',
            JSON.stringify({ albumIds: [] }),
          )
        ).status,
      ).toBe(404);
      const missing = await fetch(`${origin}/api/images/missing`, {
        headers: { cookie },
      });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ code: 'IMAGE_NOT_FOUND' });
    } finally {
      live?.close();
      await stop(server.child, server.closed);
    }
  }, 30000);
});

it('does not let metadata jobs replace processing or version summaries', () => {
  seed('metadata-isolation');
  connection.db.update(mediaImages).set({ classification: 'static' }).run();
  connection.db
    .update(mediaJobs)
    .set({ status: 'failed', error: 'thumbnail failed' })
    .run();
  const process = connection.db.select().from(mediaJobs).get()!;
  connection.db
    .insert(mediaJobs)
    .values([
      {
        ...process,
        id: 'metadata-failed',
        kind: 'metadata',
        error: 'ExifTool timeout',
        expectedVersions: [],
      },
      {
        ...process,
        id: 'metadata-running',
        kind: 'metadata',
        status: 'running',
        expectedVersions: [],
      },
    ])
    .run();
  const detail = readLibraryDetail(connection.db, 'metadata-isolation');
  const item = readLibraryPage(connection.db).items[0];
  const status = readLibraryStatus(connection.db, {
    ids: ['metadata-isolation'],
  }).items[0];
  seed('neighbor-anchor', new Date(2000));
  const neighbor = readLibraryNeighbors(
    connection.db,
    'neighbor-anchor',
    parseLibraryQuery(new URLSearchParams()),
  ).next!;
  expect(neighbor.id).toBe('metadata-isolation');
  for (const record of [detail, item, status, neighbor]) {
    expect(record.activeJob).toBeNull();
    expect(record.latestFailedJob).toMatchObject({
      id: process.id,
      error: 'thumbnail failed',
    });
    expect(record.processingJob).toMatchObject({
      id: process.id,
      status: 'failed',
      expectedVersions: process.expectedVersions,
    });
    expect(JSON.stringify(record.activeJob)).not.toContain('ExifTool');
    expect(JSON.stringify(record.latestFailedJob)).not.toContain('ExifTool');
  }
  for (const record of [detail, item, status, neighbor]) {
    expect(record.metadataJob).toMatchObject({
      id: 'metadata-running',
      status: 'running',
    });
  }
  connection.db
    .update(mediaJobs)
    .set({ status: 'succeeded', step: 'complete' })
    .where(eq(mediaJobs.id, 'metadata-running'))
    .run();
  expect(
    readLibraryStatus(connection.db, { ids: ['metadata-isolation'] }).items[0]
      .metadataJob,
  ).toMatchObject({ id: 'metadata-running', status: 'succeeded' });
  const state = getImageAccessState(connection.db, 'metadata-isolation')!;
  expect(state.latestJob!.id).toBe(process.id);
  expect(
    state.versions.find((version) => version.kind === 'thumbnail')!.status,
  ).toBe('failed');
  for (const terminal of ['succeeded', 'cancelled'] as const) {
    connection.db
      .update(mediaJobs)
      .set({ status: terminal })
      .where(eq(mediaJobs.id, process.id))
      .run();
    expect(
      readLibraryStatus(connection.db, { ids: ['metadata-isolation'] }).items[0]
        .processingJob,
    ).toMatchObject({ id: process.id, status: terminal });
  }
});

it('reports only stored expected objects from each latest processing job without publishing candidates', () => {
  const first = seed('candidate-first');
  const second = seed('candidate-second');
  const original = connection.db.select().from(mediaObjects).get()!;
  const previous = connection.db.select().from(mediaJobs).get()!;
  connection.db.update(mediaJobs).set({ status: 'succeeded' }).run();
  connection.db
    .insert(mediaJobs)
    .values([
      {
        ...previous,
        id: 'latest-first',
        createdAt: new Date(previous.createdAt.getTime() + 1000),
        imageId: first.imageId,
        status: 'running',
        step: 'watermark',
        expectedVersions: ['compressed', 'thumbnail', 'watermark'],
      },
      {
        ...previous,
        id: 'latest-second',
        createdAt: new Date(previous.createdAt.getTime() + 1000),
        imageId: second.imageId,
        scope: 'watermark',
        status: 'running',
        step: 'watermark',
        expectedVersions: ['watermark'],
      },
    ])
    .run();
  const object = (
    id: string,
    imageId: string,
    jobId: string,
    purpose: typeof mediaObjects.$inferSelect.purpose,
    status: typeof mediaObjects.$inferSelect.status,
  ) => ({ ...original, id, imageId, jobId, key: id, purpose, status });
  connection.db
    .insert(mediaObjects)
    .values([
      object(
        'old-thumbnail',
        first.imageId,
        first.jobId,
        'thumbnail',
        'stored',
      ),
      object(
        'new-compressed',
        first.imageId,
        'latest-first',
        'compressed',
        'stored',
      ),
      object(
        'partial-thumbnail',
        first.imageId,
        'latest-first',
        'thumbnail',
        'writing',
      ),
      object(
        'planned-watermark',
        first.imageId,
        'latest-first',
        'watermark',
        'planned',
      ),
      object('temporary', first.imageId, 'latest-first', 'temporary', 'stored'),
      object(
        'intermediate',
        second.imageId,
        'latest-second',
        'compressed',
        'stored',
      ),
      object(
        'cleanup-watermark',
        second.imageId,
        'latest-second',
        'watermark',
        'cleanup_pending',
      ),
    ])
    .run();
  const status = readLibraryStatus(connection.db, {
    ids: [first.imageId, second.imageId],
  });
  expect(status.items[0].processingJob).toMatchObject({
    id: 'latest-first',
    generatedVersions: ['compressed'],
  });
  expect(status.items[1].processingJob).toMatchObject({
    id: 'latest-second',
    generatedVersions: [],
  });
  const detail = readLibraryDetail(connection.db, first.imageId);
  expect(detail.processingJob).toMatchObject({
    id: 'latest-first',
    generatedVersions: ['compressed'],
  });
  expect(
    detail.versions.find((version) => version.kind === 'compressed'),
  ).toMatchObject({
    saved: false,
    downloadPath: null,
    links: null,
  });
  connection.db
    .update(mediaObjects)
    .set({ status: 'stored' })
    .where(eq(mediaObjects.id, 'partial-thumbnail'))
    .run();
  expect(
    readLibraryDetail(connection.db, first.imageId).processingJob,
  ).toMatchObject({
    generatedVersions: ['compressed', 'thumbnail'],
  });
  connection.db
    .update(mediaJobs)
    .set({ status: 'queued', expectedVersions: ['thumbnail'] })
    .where(eq(mediaJobs.id, 'latest-second'))
    .run();
  expect(
    readLibraryDetail(connection.db, second.imageId).processingJob,
  ).toMatchObject({
    generatedVersions: [],
  });
});
