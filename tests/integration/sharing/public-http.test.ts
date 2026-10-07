import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createAlbum,
  deleteAlbum,
} from '../../../src/server/collections/records.ts';
import {
  addMemberships,
  removeMemberships,
} from '../../../src/server/collections/memberships.ts';
import { albumImages } from '../../../src/server/collections/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { mediaImages, mediaJobs } from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import {
  createShare,
  updateShare,
} from '../../../src/server/sharing/configuration.ts';
import {
  albumShares,
  shareGrants,
} from '../../../src/server/sharing/schema.ts';
import type {
  PublicSharePage,
  PublicShareNeighbors,
} from '../../../src/server/sharing/public-types.ts';
import { launchLocalDelivery } from '../delivery/local-fixture.ts';

let app: Awaited<ReturnType<typeof launchLocalDelivery>>;
beforeAll(async () => {
  app = await launchLocalDelivery();
}, 30000);
afterAll(async () => {
  if (app) writeFileSync('test-results/sharing-public-server.log', app.logs());
  await app?.close();
});

async function seed(password?: string) {
  const album = app.db.transaction((tx) =>
    createAlbum(tx, {
      name: `NEVER-LEAK-${randomUUID()}`,
      description: 'PRIVATE-ALBUM-DESCRIPTION',
    }),
  );
  const share = await createShare(
    app.db,
    album.id,
    password === undefined
      ? {}
      : { password: { action: 'set', value: password } },
  );
  return { album, share };
}

function image(albumId: string, id = randomUUID()) {
  app.db.transaction(
    (tx) => {
      const accepted = acceptOriginal(tx, {
        imageId: id,
        storageId: app.storage.id,
        key: `query-fixture/${id}.png`,
        originalName: 'SECRET-ORIGINAL-NAME.png',
        visibility: 'public',
        format: 'PNG',
        mime: 'image/png',
        byteSize: 10,
        snapshot: createProcessingSnapshot(tx),
        expectedVersions: [],
      });
      tx.update(mediaJobs)
        .set({ status: 'succeeded' })
        .where(eq(mediaJobs.id, accepted.jobId))
        .run();
      tx.update(mediaImages)
        .set({
          processingStatus: 'ready',
          displayName: `SECRET-DISPLAY-${id}`,
          width: 300,
          height: 200,
        })
        .where(eq(mediaImages.id, id))
        .run();
    },
    { behavior: 'immediate' },
  );
  addMemberships(app.db, [id], { albumIds: [albumId], tagIds: [] });
  app.db
    .update(albumImages)
    .set({ joinedAt: new Date(1800000000000) })
    .where(and(eq(albumImages.albumId, albumId), eq(albumImages.imageId, id)))
    .run();
  return id;
}

const cache = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-robots-tag')).toBe('noindex');
};
const request = (path: string, options: RequestInit = {}) =>
  fetch(`${app.origin}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });
const items = (token: string, cookie = '', query = '') =>
  request(`/s/${token}/items${query}`, { headers: { cookie } });
const post = (
  token: string,
  suffix: string,
  body: unknown,
  cookie = '',
  origin = app.origin,
) =>
  request(`/s/${token}/${suffix}`, {
    method: 'POST',
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

it('HTML and RSC render real gate status and never serialize protected album content, including an owner session', async () => {
  const { album, share } = await seed('html-password');
  const id = image(album.id);
  for (const cookie of ['', app.cookie]) {
    for (const rsc of [false, true]) {
      const response = await request(`/s/${share.token}`, {
        headers: { cookie, ...(rsc ? { RSC: '1' } : {}) },
      });
      expect(response.status).toBe(401);
      cache(response);
      const body = await response.text();
      expect(response.headers.get('content-type')).toContain(
        rsc ? 'text/x-component' : 'text/html',
      );
      if (rsc) expect(body).toContain('"initial":{"status":401,"page":null}');
      else expect(body).toContain('分享密码');
      for (const hidden of [
        album.name,
        album.description,
        id,
        'passwordHash',
        'grantSecretHash',
        'SECRET-',
      ])
        expect(body).not.toContain(hidden);
    }
  }
  const unlocked = await post(share.token, 'unlock', {
    password: 'html-password',
  });
  const cookie = unlocked.headers.getSetCookie()[0].split(';')[0];
  for (const rsc of [false, true]) {
    const readable = await request(`/s/${share.token}`, {
      headers: { cookie, ...(rsc ? { RSC: '1' } : {}) },
    });
    expect(readable.status).toBe(200);
    cache(readable);
    expect(readable.headers.get('content-type')).toContain(
      rsc ? 'text/x-component' : 'text/html',
    );
    const body = await readable.text();
    expect(body).toContain(album.name);
    expect(body).toContain('noindex');
    expect(body).not.toContain('SECRET-DISPLAY-');
    if (rsc) expect(body).toContain('"initial":{"status":200,"page":{');
  }
  app.db
    .update(albumShares)
    .set({ enabled: false })
    .where(eq(albumShares.id, share.id))
    .run();
  for (const rsc of [false, true]) {
    const headers = { cookie, ...(rsc ? { RSC: '1' } : {}) };
    const closed = await request(`/s/${share.token}`, { headers });
    expect(closed.status).toBe(410);
    cache(closed);
    const closedBody = await closed.text();
    expect(closedBody).not.toContain(album.name);
    if (rsc)
      expect(closedBody).toContain('"initial":{"status":410,"page":null}');
    const missing = await request('/s/nonexistent-share', { headers });
    expect(missing.status).toBe(404);
    cache(missing);
    const missingBody = await missing.text();
    expect(missingBody).not.toContain(album.name);
    if (rsc)
      expect(missingBody).toContain('"initial":{"status":404,"page":null}');
  }
});

it('the production list is the same cropped public projection with or without an owner Cookie; 40-item pages expose only an ID anchor', async () => {
  const { album, share } = await seed();
  const prefix = randomUUID();
  const ids = Array.from({ length: 85 }, (_, index) =>
    image(album.id, `${prefix}-${String(index).padStart(3, '0')}`),
  );
  for (const [id, patch] of [
    [`${prefix}-private`, { visibility: 'private' }],
    [`${prefix}-recycled`, { trashedAt: new Date() }],
    [`${prefix}-deleted`, { deletionStatus: 'deleting' }],
  ] as const) {
    image(album.id, id);
    app.db.update(mediaImages).set(patch).where(eq(mediaImages.id, id)).run();
  }
  const response = await items(share.token);
  cache(response);
  expect(response.status).toBe(200);
  const first: PublicSharePage = await response.json();
  expect(first).toMatchObject({
    albumName: album.name,
    total: 85,
    hasMore: true,
    nextCursor: ids[39],
  });
  expect(first.items.map((item) => item.imageId)).toEqual(ids.slice(0, 40));
  expect(await (await items(share.token, app.cookie)).json()).toEqual(first);
  const second: PublicSharePage = await (
    await items(share.token, '', `?cursor=${first.nextCursor}`)
  ).json();
  const third: PublicSharePage = await (
    await items(share.token, '', `?cursor=${second.nextCursor}`)
  ).json();
  expect(second.items.map((item) => item.imageId)).toEqual(ids.slice(40, 80));
  expect(third.items.map((item) => item.imageId)).toEqual(ids.slice(80));
  expect(third).toMatchObject({ hasMore: false, nextCursor: null });
  const neighborResponse = await items(share.token, '', `?imageId=${ids[39]}`);
  expect(neighborResponse.status).toBe(200);
  cache(neighborResponse);
  const neighborBody: PublicShareNeighbors = await neighborResponse.json();
  expect(neighborBody).toMatchObject({
    current: first.items[39],
    previous: first.items[38],
    next: second.items[0],
    total: 85,
    position: 40,
    showName: false,
  });
  expect(
    await (await items(share.token, app.cookie, `?imageId=${ids[39]}`)).json(),
  ).toEqual(neighborBody);
  for (const item of [...first.items, first.cover!])
    expect(Object.keys(item).sort()).toEqual([
      'aspectRatio',
      'imageId',
      'previewUrl',
      'status',
      'thumbnailUrl',
    ]);
  for (const text of [
    'SECRET-',
    'originalName',
    'displayName',
    'byteSize',
    'storageId',
    'width',
    'height',
    'createdAt',
    'joinedAt',
    `${prefix}-private`,
    `${prefix}-recycled`,
    `${prefix}-deleted`,
  ])
    expect(JSON.stringify(first)).not.toContain(text);
  app.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, first.nextCursor!))
    .run();
  const invalid = await items(share.token, '', `?cursor=${first.nextCursor}`);
  expect(invalid.status).toBe(409);
  cache(invalid);
  expect(await invalid.json()).toMatchObject({
    code: 'SHARING_CURSOR_INVALID',
  });
  expect(
    await (await items(share.token, '', `?imageId=${first.nextCursor}`)).json(),
  ).toEqual({
    current: null,
    previous: null,
    next: null,
    total: 84,
    position: null,
    showName: false,
  });
});

it('refresh validates Origin and the 80-ID bound, reflects current names/layout and uniformly excludes inaccessible members', async () => {
  const { album, share } = await seed();
  const ids = Array.from({ length: 80 }, () => image(album.id));
  for (const origin of ['', 'https://other.example']) {
    const denied = await post(
      share.token,
      'refresh',
      { ids },
      app.cookie,
      origin,
    );
    expect(denied.status).toBe(403);
    cache(denied);
  }
  const accepted = await post(share.token, 'refresh', { ids }, app.cookie);
  expect(accepted.status).toBe(200);
  cache(accepted);
  expect(
    (await accepted.json()).items.map(
      (item: { imageId: string }) => item.imageId,
    ),
  ).toEqual(ids);
  expect(
    (await post(share.token, 'refresh', { ids: [...ids, 'extra'] })).status,
  ).toBe(400);
  expect(
    (await post(share.token, 'refresh', { ids: [], owner: true })).status,
  ).toBe(400);
  const settingsPath = `/api/albums/${album.id}/share`;
  const change = (body: object) =>
    request(settingsPath, {
      method: 'PATCH',
      headers: {
        cookie: app.cookie,
        origin: app.origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  expect((await change({ showName: true, layout: 'masonry' })).status).toBe(
    200,
  );
  expect(
    await (await post(share.token, 'refresh', { ids: ids.slice(0, 1) })).json(),
  ).toMatchObject({
    showName: true,
    layout: 'masonry',
    items: [{ displayName: `SECRET-DISPLAY-${ids[0]}` }],
  });
  expect((await change({ showName: false })).status).toBe(200);
  expect(
    JSON.stringify(
      await (
        await post(share.token, 'refresh', { ids: ids.slice(0, 1) })
      ).json(),
    ),
  ).not.toContain('displayName');
  app.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, ids[0]))
    .run();
  app.db
    .update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, ids[1]))
    .run();
  app.db
    .update(mediaImages)
    .set({ deletionStatus: 'cleanup_failed' })
    .where(eq(mediaImages.id, ids[2]))
    .run();
  app.db
    .delete(albumImages)
    .where(
      and(eq(albumImages.albumId, album.id), eq(albumImages.imageId, ids[3])),
    )
    .run();
  expect(
    await (
      await post(
        share.token,
        'refresh',
        { ids: ['unknown', ...ids.slice(0, 4)] },
        app.cookie,
      )
    ).json(),
  ).toMatchObject({ total: 76, items: [] });
  expect(
    await (await post(share.token, 'refresh', { ids: [] })).json(),
  ).toMatchObject({ total: 76, items: [] });
  for (const query of [
    '?pageSize=80',
    '?cursor=a&cursor=b',
    '?cursor=',
    '?imageId=',
    '?imageId=a&imageId=b',
    '?imageId=a&cursor=b',
    '?imageId=a%2Fb',
  ])
    expect((await items(share.token, '', query)).status).toBe(400);
});

it('owner authentication never bypasses public password gates; current revocations clear the JSON boundary without album data', async () => {
  const { album, share } = await seed('public-password');
  const imageId = image(album.id);
  const denied = async (status: number, cookie = '') => {
    for (const response of [
      ...(await Promise.all(
        [
          '',
          '?pageSize=80',
          '?owner=true',
          '?cursor=a&cursor=b',
          '?cursor=',
          '?cursor=a%2Fb',
          `?imageId=${imageId}`,
          '?imageId=a%2Fb',
          '?imageId=',
          '?imageId=a&cursor=b',
        ].map((query) => items(share.token, cookie, query)),
      )),
      await post(share.token, 'refresh', { ids: [imageId] }, cookie),
    ]) {
      expect(response.status).toBe(status);
      cache(response);
      const body = await response.text();
      for (const text of [
        album.name,
        album.description,
        imageId,
        'items',
        'total',
        'cover',
        'passwordHash',
      ])
        expect(body).not.toContain(text);
    }
  };
  await denied(401);
  await denied(401, app.cookie);
  const unlocked = await post(share.token, 'unlock', {
    password: 'public-password',
  });
  expect(unlocked.status).toBe(200);
  const grant = unlocked.headers.getSetCookie()[0].split(';')[0];
  const withOwner = `${grant}; ${app.cookie}`;
  expect((await items(share.token, withOwner)).status).toBe(200);
  const deadline = new Date();
  app.db
    .update(albumShares)
    .set({ expiresAt: deadline })
    .where(eq(albumShares.id, share.id))
    .run();
  await denied(410, withOwner);
  app.db
    .update(albumShares)
    .set({ expiresAt: null, enabled: false })
    .where(eq(albumShares.id, share.id))
    .run();
  await denied(410, withOwner);
  app.db
    .update(albumShares)
    .set({ enabled: true, authRevision: 2 })
    .where(eq(albumShares.id, share.id))
    .run();
  await denied(401, withOwner);
  app.db
    .update(albumShares)
    .set({ token: randomUUID() })
    .where(eq(albumShares.id, share.id))
    .run();
  await denied(404, withOwner);
});

it('deleting the real album cascades its share and grants while retaining the image and its independent public bytes', async () => {
  const album = app.db.transaction((tx) =>
    createAlbum(tx, { name: '删除不影响独立公开图片' }),
  );
  const asset = await app.seed();
  addMemberships(app.db, [asset.imageId], { albumIds: [album.id], tagIds: [] });
  const share = await createShare(app.db, album.id, {
    password: { action: 'set', value: 'cascade-password' },
  });
  const unlocked = await post(share.token, 'unlock', {
    password: 'cascade-password',
  });
  expect(unlocked.status).toBe(200);
  const cookie = unlocked.headers.getSetCookie()[0].split(';')[0];
  const publicBytes = async () => {
    const response = await request(`/i/${asset.imageId}?type=original`);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(asset.bytes);
  };
  expect(
    (await items(share.token, cookie, `?imageId=${asset.imageId}`)).status,
  ).toBe(200);
  await updateShare(app.db, album.id, { enabled: false });
  expect(
    (await items(share.token, cookie, `?imageId=${asset.imageId}`)).status,
  ).toBe(410);
  await publicBytes();
  await updateShare(app.db, album.id, { enabled: true });
  const fresh = await post(share.token, 'unlock', {
    password: 'cascade-password',
  });
  expect(fresh.status).toBe(200);
  const freshCookie = fresh.headers.getSetCookie()[0].split(';')[0];
  removeMemberships(app.db, [asset.imageId], {
    albumIds: [album.id],
    tagIds: [],
  });
  expect(
    await (
      await items(share.token, freshCookie, `?imageId=${asset.imageId}`)
    ).json(),
  ).toMatchObject({ current: null, total: 0 });
  await publicBytes();
  addMemberships(app.db, [asset.imageId], { albumIds: [album.id], tagIds: [] });
  expect(
    app.db
      .select()
      .from(shareGrants)
      .where(eq(shareGrants.shareId, share.id))
      .all(),
  ).toHaveLength(1);
  app.db.transaction((tx) => deleteAlbum(tx, album.id));
  expect(
    app.db.select().from(albumShares).where(eq(albumShares.id, share.id)).all(),
  ).toEqual([]);
  expect(
    app.db
      .select()
      .from(shareGrants)
      .where(eq(shareGrants.shareId, share.id))
      .all(),
  ).toEqual([]);
  expect(
    app.db
      .select()
      .from(mediaImages)
      .where(eq(mediaImages.id, asset.imageId))
      .get(),
  ).toBeDefined();
  const missing = await items(
    share.token,
    freshCookie,
    `?imageId=${asset.imageId}`,
  );
  expect(missing.status).toBe(404);
  cache(missing);
  await publicBytes();
});
