import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import type { createTag } from '../../../src/server/collections/tag-management.ts';
import { UPLOAD_MAX_FILE_MIB } from '../../../src/shared/upload-settings.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('protects upload settings and quick tag creation with real owner and origin checks, and preserves database errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-upload-settings-http-'));
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
    const operations = [
      ['/api/settings/upload', 'GET'],
      ['/api/settings/upload', 'PATCH'],
      ['/api/tags', 'POST'],
    ];
    for (const headers of [
      {},
      { authorization: `Bearer ${token}` },
      { cookie: `ariso.share_token=${token}` },
    ] as Record<string, string>[]) {
      for (const [path, method] of operations) {
        const response = await fetch(`${origin}${path}`, { method, headers });
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
    const headers = { cookie, origin, 'content-type': 'application/json' };
    for (const [path, method] of operations.filter(
      ([, method]) => method !== 'GET',
    )) {
      for (const invalidOrigin of ['', 'https://other.example']) {
        const response = await fetch(`${origin}${path}`, {
          method,
          headers: { ...headers, origin: invalidOrigin },
          body: '{}',
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
      }
    }
    const settingsUrl = `${origin}/api/settings/upload`;
    expect(await (await fetch(settingsUrl, { headers })).json()).toEqual({
      maxFileMiB: 50,
      maxFileBytes: 52428800,
      batchSize: 20,
      queueLimit: 500,
    });
    const saved = await fetch(settingsUrl, {
      method: 'PATCH',
      headers,
      body: '{"maxFileMiB":1,"batchSize":150}',
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      maxFileBytes: 1048576,
      batchSize: 150,
      queueLimit: 500,
    });
    const invalidSettings = await fetch(settingsUrl, {
      method: 'PATCH',
      headers,
      body: '{"queueLimit":100}',
    });
    expect(invalidSettings.status).toBe(422);
    expect(await invalidSettings.json()).toMatchObject({
      code: 'UPLOAD_SETTINGS_INVALID',
      message: '请检查上传限制字段',
      fields: [{ field: 'batchSize', message: '批次大小不能超过队列上限' }],
    });
    expect(await (await fetch(settingsUrl, { headers })).json()).toMatchObject({
      batchSize: 150,
      queueLimit: 500,
    });
    for (const [input, fields] of [
      [
        { maxFileMiB: 1.5, batchSize: 0, queueLimit: 2001 },
        [
          { field: 'maxFileMiB', message: '请输入正整数 MiB' },
          { field: 'batchSize', message: '请输入 1–200 的整数' },
          { field: 'queueLimit', message: '请输入 100–2000 的整数' },
        ],
      ],
      [
        { maxFileMiB: UPLOAD_MAX_FILE_MIB + 1 },
        [
          {
            field: 'maxFileMiB',
            message: '文件大小换算为字节后超出可保存范围',
          },
        ],
      ],
      [
        { maxFileBytes: 1024 },
        [{ field: 'maxFileBytes', message: '未知字段' }],
      ],
    ]) {
      const response = await fetch(settingsUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(422);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        code: 'UPLOAD_SETTINGS_INVALID',
        fields,
      });
      expect(
        await (await fetch(settingsUrl, { headers })).json(),
      ).toMatchObject({
        maxFileBytes: 1048576,
        batchSize: 150,
        queueLimit: 500,
      });
    }
    expect(
      (await fetch(settingsUrl, { method: 'PATCH', headers, body: '{' }))
        .status,
    ).toBe(400);

    const tagsUrl = `${origin}/api/tags`;
    for (const body of [
      '{',
      '{}',
      '{"name":" "}',
      '{"name":123}',
      '{"name":"ok","extra":true}',
      JSON.stringify({ name: 'a'.repeat(51) }),
    ]) {
      const response = await fetch(tagsUrl, { method: 'POST', headers, body });
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const error = await response.json();
      expect(error).toMatchObject({
        code: 'COLLECTION_INVALID_INPUT',
      });
      if (body === '{') expect(error.message).toBe('请求内容必须是有效的 JSON');
    }
    const create = async (name: string) => {
      const response = await fetch(tagsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      });
      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('no-store');
      return (await response.json()).tag as ReturnType<typeof createTag>['tag'];
    };
    const first = await create(' Go ');
    expect(first).toEqual({
      id: expect.any(String),
      displayName: 'Go',
      imageCount: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(await create('go')).toEqual(first);
    expect(
      live.db.$client.prepare('SELECT COUNT(*) AS count FROM tags').get(),
    ).toEqual({ count: 1 });
    expect(
      await (await fetch(`${origin}/upload/settings`, { headers })).json(),
    ).toMatchObject({
      tags: [{ id: first.id, displayName: first.displayName }],
    });

    live.db.$client.exec(
      "CREATE TRIGGER reject_tag BEFORE INSERT ON tags BEGIN SELECT RAISE(ABORT, 'tag database write failure'); END",
    );
    const failed = await fetch(tagsUrl, {
      method: 'POST',
      headers,
      body: '{"name":"another"}',
    });
    expect(failed.status).toBe(500);
    expect(failed.headers.get('cache-control')).toBe('no-store');
    expect(await failed.json()).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: '标签操作失败，请重试',
    });
    expect(
      live.db.$client.prepare('SELECT COUNT(*) AS count FROM tags').get(),
    ).toEqual({ count: 1 });
    await vi.waitFor(() => {
      expect(server.logs()).toContain('tag database write failure');
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
          level: 'error',
          method: 'POST',
          path: '/api/tags',
          msg: 'Tag management failed',
        }),
      );
    });
    live.db.$client.exec('DELETE FROM upload_settings');
    for (const method of ['GET', 'PATCH']) {
      const response = await fetch(settingsUrl, {
        method,
        headers,
        ...(method === 'PATCH' ? { body: '{"batchSize":10}' } : {}),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'UPLOAD_NOT_INITIALIZED',
        message: '上传设置尚未初始化',
      });
    }
    expect(
      live.db.$client
        .prepare('SELECT COUNT(*) AS count FROM upload_settings')
        .get(),
    ).toEqual({ count: 0 });
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
