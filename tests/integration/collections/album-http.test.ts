import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('authenticates every album operation, checks write origins, and returns real CRUD results and errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-album-http-'));
  const data = join(directory, 'data');
  const server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: data,
    HOST: '127.0.0.1',
  });
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
    live = openRuntimeDatabase(join(data, 'ariso.db'));
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
      for (const [path, method] of [
        ['', 'GET'],
        ['', 'POST'],
        ['/missing', 'GET'],
        ['/missing', 'PATCH'],
        ['/missing', 'DELETE'],
        ['/missing/cover', 'PUT'],
      ]) {
        const response = await fetch(`${origin}/api/albums${path}`, {
          method,
          headers,
        });
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
    const headers = { cookie, origin, 'content-type': 'application/json' };
    for (const [path, method] of [
      ['', 'POST'],
      ['/missing', 'PATCH'],
      ['/missing', 'DELETE'],
      ['/missing/cover', 'PUT'],
    ]) {
      for (const invalidOrigin of ['', 'https://other.example']) {
        const response = await fetch(`${origin}/api/albums${path}`, {
          method,
          headers: { ...headers, origin: invalidOrigin },
          body: method === 'DELETE' ? undefined : '{}',
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
      }
    }
    for (const body of ['{', '{}', '{"name":" "}', '{"name":123}']) {
      const response = await fetch(`${origin}/api/albums`, {
        method: 'POST',
        headers,
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'COLLECTION_INVALID_INPUT',
      });
    }
    const created = await fetch(`${origin}/api/albums`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: ' 相册 ', description: ' 描述 ' }),
    });
    expect(created.status).toBe(201);
    const { album } = await created.json();
    expect(album).toMatchObject({
      name: '相册',
      description: '描述',
      imageCount: 0,
    });
    const list = await fetch(
      `${origin}/api/albums?q=${encodeURIComponent('相册')}&pageSize=20`,
      { headers },
    );
    expect(await list.json()).toEqual({
      items: [album],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(
      (await fetch(`${origin}/api/albums?pageSize=30`, { headers })).status,
    ).toBe(400);
    const url = `${origin}/api/albums/${album.id}`;
    const updated = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: '更名', description: '多行\n描述' }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      album: { id: album.id, name: '更名', description: '多行\n描述' },
    });
    expect(await (await fetch(url, { headers })).json()).toMatchObject({
      album: { name: '更名' },
    });
    const coverUrl = `${url}/cover`;
    for (const body of [
      '{',
      '{}',
      '{"imageId":123}',
      '{"imageId":null,"extra":true}',
    ]) {
      const response = await fetch(coverUrl, { method: 'PUT', headers, body });
      expect(response.status).toBe(400);
    }
    const automatic = await fetch(coverUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ imageId: null }),
    });
    expect(automatic.status).toBe(200);
    expect(await automatic.json()).toMatchObject({
      album: {
        cover: {
          mode: 'empty',
          imageId: null,
          preferredCoverImageId: null,
          status: 'empty',
          thumbnailUrl: null,
        },
      },
    });
    const storage = live.db.$client
      .prepare('SELECT id FROM storage_configs LIMIT 1')
      .get() as { id: string };
    live.db.$client
      .prepare(
        'INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,byte_size,processing_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'http-cover',
        storage.id,
        '封面.png',
        '封面.png',
        'public',
        'png',
        'image/png',
        100,
        'processing',
        1000,
        1000,
      );
    live.db.$client
      .prepare(
        'INSERT INTO album_images (album_id,image_id,joined_at) VALUES (?,?,?)',
      )
      .run(album.id, 'http-cover', 1000);
    const manual = await fetch(coverUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ imageId: 'http-cover' }),
    });
    expect(manual.status).toBe(200);
    expect(await manual.json()).toMatchObject({
      album: {
        publicImageCount: 1,
        cover: {
          mode: 'manual',
          imageId: 'http-cover',
          preferredCoverImageId: 'http-cover',
          status: 'processing',
          thumbnailUrl: null,
        },
      },
    });
    live.db.$client
      .prepare('UPDATE media_images SET visibility=? WHERE id=?')
      .run('private', 'http-cover');
    expect(await (await fetch(url, { headers })).json()).toMatchObject({
      album: {
        cover: {
          preferredCoverImageId: 'http-cover',
          temporaryFallback: true,
          mode: 'empty',
        },
      },
    });
    const unavailable = await fetch(coverUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ imageId: 'http-cover' }),
    });
    expect(unavailable.status).toBe(400);
    const reset = await fetch(coverUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ imageId: null }),
    });
    expect((await reset.json()).album.cover.preferredCoverImageId).toBeNull();
    const invalidCover = await fetch(coverUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ imageId: 'missing' }),
    });
    expect(invalidCover.status).toBe(400);
    expect(await invalidCover.json()).toMatchObject({
      code: 'COLLECTION_IMAGE_UNAVAILABLE',
    });
    live.db.$client.exec(
      "CREATE TRIGGER reject_album BEFORE UPDATE ON albums BEGIN SELECT RAISE(ABORT, 'test database write failure'); END",
    );
    const failed = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: '不应保存' }),
    });
    expect(failed.status).toBe(500);
    expect(
      (
        await fetch(coverUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ imageId: null }),
        })
      ).status,
    ).toBe(500);
    expect(await failed.json()).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(await (await fetch(url, { headers })).json()).toMatchObject({
      album: { name: '更名' },
    });
    live.db.$client.exec(
      "CREATE TRIGGER reject_album_delete BEFORE DELETE ON albums BEGIN SELECT RAISE(ABORT, 'test database delete failure'); END",
    );
    const rejectedDelete = await fetch(url, { method: 'DELETE', headers });
    expect(rejectedDelete.status).toBe(500);
    expect(await rejectedDelete.json()).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    await vi.waitFor(() => {
      const records = server
        .logs()
        .split('\n')
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        });
      expect(records).toContainEqual(
        expect.objectContaining({
          module: 'collections.albums',
          method: 'DELETE',
          path: `/api/albums/${album.id}`,
          msg: 'Album management failed',
        }),
      );
    });
    expect((await fetch(url, { headers })).status).toBe(200);
    live.db.$client.exec('DROP TRIGGER reject_album_delete');
    const deleted = await fetch(url, { method: 'DELETE', headers });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'PATCH' ? JSON.stringify({ name: '有效' }) : undefined,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        code: 'COLLECTION_TARGET_NOT_FOUND',
      });
    }
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
