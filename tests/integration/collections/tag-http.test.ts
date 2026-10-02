import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('requires owner sessions and write origins, exposes Unicode CRUD results, and retains real database errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-tag-http-'));
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
      ]) {
        const response = await fetch(`${origin}/api/tags${path}`, {
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
    ]) {
      for (const invalidOrigin of ['', 'https://other.example']) {
        const response = await fetch(`${origin}/api/tags${path}`, {
          method,
          headers: { ...headers, origin: invalidOrigin },
          body: method === 'DELETE' ? undefined : '{}',
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
      }
    }
    for (const body of [
      '{',
      '{}',
      '{"name":" "}',
      '{"name":123}',
      '{"name":"ok","extra":true}',
    ]) {
      const response = await fetch(`${origin}/api/tags`, {
        method: 'POST',
        headers,
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'COLLECTION_INVALID_INPUT',
      });
    }
    const create = (name: string) =>
      fetch(`${origin}/api/tags`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      });
    const created = await create(' Straße ');
    expect(created.status).toBe(201);
    const { tag, reused } = await created.json();
    expect(reused).toBe(false);
    expect(tag).toMatchObject({ displayName: 'Straße', imageCount: 0 });
    for (const name of ['STRASSE', 'straße']) {
      const result = await create(name);
      expect(result.status).toBe(201);
      expect(await result.json()).toEqual({ tag, reused: true });
    }
    const concurrent = await Promise.all(['Go', 'go', 'GO'].map(create));
    const matches = await Promise.all(
      concurrent.map(async (response) => {
        expect(response.status).toBe(201);
        return response.json();
      }),
    );
    expect(new Set(matches.map((item) => item.tag.id)).size).toBe(1);
    expect(matches.filter((item) => !item.reused)).toHaveLength(1);
    expect(new Set(matches.map((item) => item.tag.displayName)).size).toBe(1);
    const go = matches[0].tag;
    const list = await fetch(`${origin}/api/tags?q=STRASSE&pageSize=20`, {
      headers,
    });
    expect(await list.json()).toEqual({
      items: [tag],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(
      (await fetch(`${origin}/api/tags?pageSize=30`, { headers })).status,
    ).toBe(400);
    const url = `${origin}/api/tags/${tag.id}`;
    expect(await (await fetch(url, { headers })).json()).toEqual({ tag });
    const rename = (name: string) =>
      fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ name }) });
    expect(await (await rename('STRASSE')).json()).toEqual({
      tag,
      changed: false,
    });
    const conflict = await rename('GO');
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: 'COLLECTION_TAG_CONFLICT',
    });
    expect(await (await fetch(url, { headers })).json()).toEqual({ tag });
    const updated = await rename(' e\u0301 ');
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      tag: { id: tag.id, displayName: 'é' },
      changed: true,
    });
    const missing = `${origin}/api/tags/missing`;
    for (const method of ['GET', 'PATCH']) {
      const response = await fetch(missing, {
        method,
        headers,
        body: method === 'PATCH' ? JSON.stringify({ name: '有效' }) : undefined,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        code: 'COLLECTION_TARGET_NOT_FOUND',
      });
    }
    live.db.$client.exec(
      "CREATE TRIGGER reject_tag BEFORE UPDATE ON tags BEGIN SELECT RAISE(ABORT, 'test database write failure'); END",
    );
    const failed = await rename('不应保存');
    expect(failed.status).toBe(500);
    expect(failed.headers.get('cache-control')).toBe('no-store');
    expect(await failed.json()).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: '标签操作失败，请重试',
    });
    expect(await (await fetch(url, { headers })).json()).toMatchObject({
      tag: { displayName: 'é' },
    });
    live.db.$client.exec(
      "CREATE TRIGGER reject_tag_delete BEFORE DELETE ON tags BEGIN SELECT RAISE(ABORT, 'test database delete failure'); END",
    );
    const rejectedDelete = await fetch(url, { method: 'DELETE', headers });
    expect(rejectedDelete.status).toBe(500);
    expect(rejectedDelete.headers.get('cache-control')).toBe('no-store');
    expect(await rejectedDelete.json()).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: '标签操作失败，请重试',
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
          module: 'collections.tags',
          method: 'DELETE',
          path: `/api/tags/${tag.id}`,
          msg: 'Tag management failed',
        }),
      );
      for (const [method, path, code, status] of [
        ['POST', '/api/tags', 'COLLECTION_INVALID_INPUT', 400],
        ['GET', '/api/tags/missing', 'COLLECTION_TARGET_NOT_FOUND', 404],
        ['PATCH', `/api/tags/${tag.id}`, 'COLLECTION_TAG_CONFLICT', 409],
      ])
        expect(records).toContainEqual(
          expect.objectContaining({
            module: 'collections.tags',
            method,
            path,
            code,
            status,
            msg: 'Tag management rejected',
          }),
        );
      const tagLogs = JSON.stringify(
        records.filter((record) => record.module === 'collections.tags'),
      );
      expect(tagLogs).not.toContain(cookie);
      expect(tagLogs).not.toContain(token);
    });
    live.db.$client.exec('DROP TRIGGER reject_tag_delete');
    expect(
      await (await fetch(url, { method: 'DELETE', headers })).json(),
    ).toEqual({ deleted: true });
    expect(
      await (await fetch(url, { method: 'DELETE', headers })).json(),
    ).toEqual({ deleted: false });
    expect((await fetch(url, { headers })).status).toBe(404);
    expect(
      await (await fetch(`${origin}/api/tags/${go.id}`, { headers })).json(),
    ).toMatchObject({ tag: { id: go.id } });
    live.db.$client.exec(
      "CREATE TRIGGER reject_tag_create BEFORE INSERT ON tags BEGIN SELECT RAISE(ABORT, 'test database create failure'); END",
    );
    expect((await create('创建失败')).status).toBe(500);
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
