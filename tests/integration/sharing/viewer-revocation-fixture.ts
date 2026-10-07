import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createAlbum } from '../../../src/server/collections/records.ts';
import { albumImages } from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import type { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import {
  albumShares,
  shareGrants,
} from '../../../src/server/sharing/schema.ts';
import type { PublicShareNeighbors } from '../../../src/server/sharing/public-types.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';

type App = {
  db: ReturnType<typeof openRuntimeDatabase>['db'];
  origin: string;
  cookie: string;
};
export type RevocationEvidence = {
  condition: string;
  shareStatus: number;
  newContentStatus: number;
  previousSignedStatus?: number;
};

/** The same production HTTP assertions run against Local, protocol S3 and live S3. */
export async function verifyViewerRevocations(
  app: App,
  asset: { imageId: string; bytes: Buffer },
  storageId: string,
  transport: 'local' | 's3',
  signal?: AbortSignal,
) {
  const evidence: RevocationEvidence[] = [];
  const request = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, app.origin), {
      ...init,
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(30000),
      ]),
    });
  const write = (path: string, method: string, body?: object) =>
    request(path, {
      method,
      headers: {
        cookie: app.cookie,
        origin: app.origin,
        'content-type': 'application/json',
      },
      body: body && JSON.stringify(body),
    });
  const content = (method = 'GET', cookie = '') =>
    request(`/i/${asset.imageId}?type=original`, {
      method,
      redirect: 'manual',
      headers: { cookie },
    });
  const contentStatus = transport === 'local' ? 200 : 302;
  const checkContent = async (expected: number, cookie = '') => {
    for (const method of ['GET', 'HEAD']) {
      const response = await content(method, cookie);
      assert.equal(response.status, expected, `${method} content permission`);
      assert.equal(
        response.headers.get('cache-control'),
        'private, no-store, no-transform',
      );
      if (expected === 200 && method === 'GET')
        assert.deepEqual(
          Buffer.from(await response.arrayBuffer()),
          asset.bytes,
        );
      else await response.arrayBuffer();
    }
  };
  const seed = async () => {
    const album = app.db.transaction((tx) =>
      createAlbum(tx, {
        name: '撤权联验相册',
        description: '撤权后不可出现的相册描述',
      }),
    );
    app.db
      .insert(albumImages)
      .values({
        albumId: album.id,
        imageId: asset.imageId,
        joinedAt: new Date(),
      })
      .run();
    const created = await write(`/api/albums/${album.id}/share`, 'POST', {
      password: { action: 'set', value: 'viewer-revocation-password' },
    });
    assert.equal(created.status, 200);
    const { share } = (await created.json()) as {
      share: { id: string; token: string };
    };
    const base = `/s/${share.token}`;
    const unlocked = await request(`${base}/unlock`, {
      method: 'POST',
      headers: { origin: app.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'viewer-revocation-password' }),
    });
    assert.equal(unlocked.status, 200);
    const grant = unlocked.headers.getSetCookie()[0].split(';')[0];
    const neighbors = await request(`${base}/items?imageId=${asset.imageId}`, {
      headers: { cookie: grant },
    });
    assert.equal(neighbors.status, 200);
    assert.equal(neighbors.headers.get('cache-control'), 'private, no-store');
    const body = (await neighbors.json()) as PublicShareNeighbors;
    assert.ok(body.current);
    assert.equal(body.current?.imageId, asset.imageId);
    assert.equal(body.current?.status, 'ready');
    assert.ok(body.current.previewUrl);
    assert.equal(body.previous, null);
    assert.equal(body.next, null);
    assert.equal(body.position, 1);
    return { album, share, base, grant };
  };
  const assertDenied = async (
    state: Awaited<ReturnType<typeof seed>>,
    expected: number,
  ) => {
    const headers = { cookie: `${state.grant}; ${app.cookie}` };
    const responses = await Promise.all([
      request(state.base, { headers }),
      request(state.base, { headers: { ...headers, RSC: '1' } }),
      request(`${state.base}/items`, { headers }),
      request(`${state.base}/items?imageId=${asset.imageId}`, { headers }),
      request(`${state.base}/refresh`, {
        method: 'POST',
        headers: {
          ...headers,
          origin: app.origin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ids: [asset.imageId] }),
      }),
    ]);
    for (const response of responses) {
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.text();
      for (const secret of [
        state.album.name,
        state.album.description,
        asset.imageId,
        'previewUrl',
        'grantSecretHash',
      ])
        assert.equal(
          body.includes(secret),
          false,
          `Denied body excludes ${secret}`,
        );
    }
  };

  for (const condition of [
    'closed',
    'password',
    'expired',
    'rotated',
    'deleted',
  ]) {
    signal?.throwIfAborted();
    const state = await seed();
    const path = `/api/albums/${state.album.id}/share`;
    let expected = 410;
    if (condition === 'closed')
      assert.equal(
        (await write(path, 'PATCH', { enabled: false })).status,
        200,
      );
    if (condition === 'password') {
      assert.equal(
        (
          await write(path, 'PATCH', {
            password: { action: 'set', value: 'changed-viewer-password' },
          })
        ).status,
        200,
      );
      expected = 401;
    }
    if (condition === 'expired')
      app.db
        .update(albumShares)
        .set({ expiresAt: new Date(Date.now() - 1) })
        .where(eq(albumShares.id, state.share.id))
        .run();
    if (condition === 'rotated') {
      assert.equal((await write(`${path}/rotate`, 'POST')).status, 200);
      expected = 404;
    }
    if (condition === 'deleted') {
      const survivor = app.db.transaction((tx) =>
        createAlbum(tx, { name: '另一个相册', description: '' }),
      );
      app.db
        .insert(albumImages)
        .values({
          albumId: survivor.id,
          imageId: asset.imageId,
          joinedAt: new Date(),
        })
        .run();
      assert.equal(
        (await write(`/api/albums/${state.album.id}`, 'DELETE')).status,
        200,
      );
      assert.equal(
        app.db
          .select()
          .from(albumShares)
          .where(eq(albumShares.id, state.share.id))
          .get(),
        undefined,
      );
      assert.deepEqual(
        app.db
          .select()
          .from(shareGrants)
          .where(eq(shareGrants.shareId, state.share.id))
          .all(),
        [],
      );
      assert.ok(
        app.db
          .select()
          .from(mediaImages)
          .where(eq(mediaImages.id, asset.imageId))
          .get(),
      );
      assert.ok(
        app.db
          .select()
          .from(mediaVersions)
          .where(eq(mediaVersions.imageId, asset.imageId))
          .all().length,
      );
      assert.ok(
        app.db
          .select()
          .from(albumImages)
          .where(
            and(
              eq(albumImages.albumId, survivor.id),
              eq(albumImages.imageId, asset.imageId),
            ),
          )
          .get(),
      );
      expected = 404;
    }
    await assertDenied(state, expected);
    await checkContent(contentStatus, state.grant);
    evidence.push({
      condition,
      shareStatus: expected,
      newContentStatus: contentStatus,
    });
    if (condition === 'closed') {
      assert.equal((await write(path, 'PATCH', { enabled: true })).status, 200);
      await assertDenied(state, 401);
    }
    if (condition === 'expired') {
      assert.equal(
        (await write(path, 'PATCH', { expiresAt: null })).status,
        200,
      );
      await assertDenied(state, 401);
    }
  }

  for (const condition of ['private', 'trashed', 'removed', 'disabled']) {
    signal?.throwIfAborted();
    const state = await seed();
    let signed = '';
    if (transport === 's3') {
      const issued = await content();
      assert.equal(issued.status, 302);
      signed = issued.headers.get('location')!;
      assert.equal(new URL(signed).searchParams.get('X-Amz-Expires'), '300');
    }
    try {
      if (condition === 'private')
        app.db
          .update(mediaImages)
          .set({ visibility: 'private' })
          .where(eq(mediaImages.id, asset.imageId))
          .run();
      if (condition === 'trashed')
        app.db
          .update(mediaImages)
          .set({ trashedAt: new Date() })
          .where(eq(mediaImages.id, asset.imageId))
          .run();
      if (condition === 'removed')
        app.db
          .delete(albumImages)
          .where(
            and(
              eq(albumImages.albumId, state.album.id),
              eq(albumImages.imageId, asset.imageId),
            ),
          )
          .run();
      if (condition === 'disabled')
        app.db
          .update(storageConfigs)
          .set({ enabled: false })
          .where(eq(storageConfigs.id, storageId))
          .run();
      const response = await request(
        `${state.base}/items?imageId=${asset.imageId}`,
        { headers: { cookie: `${state.grant}; ${app.cookie}` } },
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as PublicShareNeighbors;
      if (condition === 'disabled') {
        assert.ok(body.current);
        assert.equal(body.current?.status, 'disabled');
        assert.equal(body.current.previewUrl, null);
      } else {
        assert.equal(body.current, null);
        assert.equal(body.position, null);
        assert.equal(body.total, 0);
      }
      const expected =
        condition === 'private'
          ? 401
          : condition === 'trashed'
            ? 404
            : condition === 'disabled'
              ? 409
              : contentStatus;
      await checkContent(expected, state.grant);
      if (signed) {
        const previous = await fetch(signed, {
          signal: AbortSignal.timeout(30000),
        });
        assert.equal(previous.status, 200);
        assert.deepEqual(
          Buffer.from(await previous.arrayBuffer()),
          asset.bytes,
        );
      }
      evidence.push({
        condition,
        shareStatus: 200,
        newContentStatus: expected,
        ...(signed ? { previousSignedStatus: 200 } : {}),
      });
    } finally {
      app.db
        .update(mediaImages)
        .set({ visibility: 'public', trashedAt: null })
        .where(eq(mediaImages.id, asset.imageId))
        .run();
      app.db
        .update(storageConfigs)
        .set({ enabled: true })
        .where(eq(storageConfigs.id, storageId))
        .run();
    }
  }
  assert.deepEqual(app.db.$client.pragma('foreign_key_check'), []);
  return evidence;
}
