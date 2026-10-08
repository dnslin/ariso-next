import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { email, password } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>> | undefined;
let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
let origin: string;
let cookie: string;
let token: string;
function request(path: string, init: RequestInit = {}, address = origin) {
  return fetch(`${address}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}
const patch = (
  value: unknown,
  headers: Record<string, string> = { cookie, origin },
) =>
  request('/api/settings/site', {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
const read = () => request('/api/settings/site', { headers: { cookie } });

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-site-settings-http-'));
  const dataDir = join(directory, 'data');
  server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
    PATH: process.env.PATH,
  });
  origin = `http://127.0.0.1:${server.port}`;
  await vi.waitFor(
    async () => {
      expect(server!.child.exitCode, server!.logs()).toBeNull();
      expect((await request('/api/health')).status).toBe(200);
    },
    { timeout: 15000 },
  );
  const entries = server
    .logs()
    .split('\n')
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.module === 'identity.setup' && entry.event === 'setup-code'
          ? [entry]
          : [];
      } catch {
        return [];
      }
    });
  expect(entries).toHaveLength(1);
  const setup = await request('/api/setup', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      code: entries[0].code,
      email,
      password,
      publicUrl: origin,
      timeZone: 'Asia/Shanghai',
    }),
  });
  expect(setup.status, await setup.clone().text()).toBe(200);
  const login = await request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(login.status, await login.clone().text()).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  token = (await login.json()).token;
  connection = openRuntimeDatabase(join(dataDir, 'ariso.db'));
}, 30000);
afterEach(async () => {
  try {
    if (server) await stop(server.child, server.closed);
  } finally {
    server = undefined;
    connection?.close();
    connection = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it('GET/PATCH 只认所有者 Cookie，写入要求当前站点来源，返回 no-store 和 UTC 时间', async () => {
  for (const headers of [
    {},
    { authorization: `Bearer ${token}` },
    { cookie: `ariso.share_token=${token}` },
  ] as Record<string, string>[]) {
    for (const response of [
      await request('/api/settings/site', { headers }),
      await patch({ name: '改名' }, { ...headers, origin }),
    ]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    }
  }
  for (const headers of [
    { cookie },
    { cookie, origin: 'https://foreign.example' },
  ] as Record<string, string>[]) {
    const response = await patch({ name: '改名' }, headers);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
  }
  const response = await read();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const value = await response.json();
  expect(value).toMatchObject({
    name: 'Ariso',
    description: '',
    publicUrl: origin,
    timeZone: 'Asia/Shanghai',
    githubCallbackUrl: `${origin}/api/auth/callback/github`,
    logoKey: null,
    faviconKey: null,
  });
  expect(new Date(value.updatedAt).toISOString()).toBe(value.updatedAt);
});

it('拒绝空 PATCH、非法四字段和其他模块字段，字段错误可定位且不部分保存', async () => {
  const before = await (await read()).json();
  for (const [input, field] of [
    [{ name: ' ' }, 'name'],
    [{ timeZone: '+08:00' }, 'timeZone'],
    [{ publicUrl: 'https://example.com/ariso/' }, 'publicUrl'],
    [{ description: null }, 'description'],
    [{ name: '不能部分保存', defaultStorageId: null }, 'defaultStorageId'],
    [{ theme: 'dark' }, 'theme'],
    [{ quality: 50 }, 'quality'],
    [{ logoKey: '/tmp/logo' }, 'logoKey'],
    [{}, ''],
  ] as const) {
    const response = await patch(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'SITE_INVALID_INPUT',
      fields: expect.arrayContaining([expect.objectContaining({ field })]),
    });
  }
  const malformed = await request('/api/settings/site', {
    method: 'PATCH',
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: '{',
  });
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({ code: 'SITE_INVALID_INPUT' });
  expect(await (await read()).json()).toEqual(before);
});

it('名称与描述分别保存，地址和时区保持不变；数据库故障保持旧值且返回稳定错误', async () => {
  const renamed = await patch({ name: '  我的站点  ' });
  expect(renamed.status).toBe(200);
  expect(await renamed.json()).toMatchObject({
    name: '我的站点',
    description: '',
    publicUrl: origin,
    timeZone: 'Asia/Shanghai',
    publicUrlChanged: false,
    notices: [],
  });
  const described = await patch({ description: '普通文本 <b>原样保存</b>' });
  expect(described.status).toBe(200);
  expect(await described.json()).toMatchObject({
    name: '我的站点',
    description: '普通文本 <b>原样保存</b>',
  });
  const before = await (await read()).json();
  connection!.db.$client.exec(
    "CREATE TRIGGER reject_site_patch BEFORE UPDATE ON site_settings BEGIN SELECT RAISE(ABORT, 'site write failed'); END",
  );
  const failed = await patch({ name: '未保存', timeZone: 'UTC' });
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({
    code: 'SITE_INTERNAL_ERROR',
    message: '站点信息操作失败，请检查服务日志后重试',
  });
  expect(await (await read()).json()).toEqual(before);
  connection!.db.$client.exec('DROP TRIGGER reject_site_patch');
  expect((await patch({ description: '' })).status).toBe(200);
});

it('origin 变化使所有 S3 失效，登录与 OAuth 回调立即使用新地址，旧来源写入被拒绝且不自动跳转', async () => {
  const local = connection!.db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.type, 'local'))
    .all();
  for (const enabled of [true, false])
    connection!.db
      .insert(storageConfigs)
      .values({
        id: `s3-${enabled}`,
        name: `S3 ${enabled}`,
        type: 's3',
        enabled,
        corsStatus: 'passed',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  const next = `http://localhost:${server!.port}`;
  const changed = await patch({ publicUrl: `${next}/`, timeZone: 'UTC' });
  expect(changed.status).toBe(200);
  expect(changed.headers.get('location')).toBeNull();
  expect(await changed.json()).toMatchObject({
    publicUrl: next,
    timeZone: 'UTC',
    publicUrlChanged: true,
    githubCallbackUrl: `${next}/api/auth/callback/github`,
    notices: expect.arrayContaining([
      expect.stringContaining('OAuth'),
      expect.stringContaining('CORS'),
      expect.stringContaining('旧域名'),
    ]),
  });
  expect(
    connection!.db
      .select({ status: storageConfigs.corsStatus })
      .from(storageConfigs)
      .where(eq(storageConfigs.type, 's3'))
      .all(),
  ).toEqual([{ status: 'invalidated' }, { status: 'invalidated' }]);
  expect(
    connection!.db
      .select()
      .from(storageConfigs)
      .where(eq(storageConfigs.type, 'local'))
      .all(),
  ).toEqual(local);
  expect((await patch({ name: '旧来源' })).status).toBe(403);
  const oldLogin = await request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(oldLogin.status).toBe(403);
  const login = await request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { origin: next, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    next,
  );
  expect(login.status, await login.clone().text()).toBe(200);
  const nextCookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const github = await request(
    '/api/settings/github',
    { headers: { cookie: nextCookie } },
    next,
  );
  expect(github.status).toBe(200);
  expect(await github.json()).toMatchObject({
    callbackUrl: `${next}/api/auth/callback/github`,
  });
  const saved = await request(
    '/api/settings/site',
    {
      method: 'PATCH',
      headers: {
        cookie: nextCookie,
        origin: next,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '新地址站点' }),
    },
    next,
  );
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({
    name: '新地址站点',
    publicUrl: next,
    publicUrlChanged: false,
  });
  expect(connection!.db.select().from(siteSettings).get()?.name).toBe(
    '新地址站点',
  );
});

it('站点先写后 CORS 写入失败，HTTP 返回失败且全部数据库状态回滚', async () => {
  connection!.db
    .insert(storageConfigs)
    .values({
      id: 's3-failure',
      name: 'S3 failure',
      type: 's3',
      enabled: true,
      corsStatus: 'passed',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  const before = await (await read()).json();
  const storage = connection!.db.select().from(storageConfigs).all();
  connection!.db.$client.exec(
    "CREATE TRIGGER reject_cors_patch BEFORE UPDATE ON storage_configs BEGIN SELECT RAISE(ABORT, 'cors update failed'); END",
  );
  const response = await patch({
    publicUrl: 'https://new.example.com',
    name: '未保存',
  });
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ code: 'SITE_INTERNAL_ERROR' });
  expect(await (await read()).json()).toEqual(before);
  expect(connection!.db.select().from(storageConfigs).all()).toEqual(storage);
});

it('已有所有者的站点配置损坏时 GET/PATCH 返回 500，不推断地址或创建记录', async () => {
  connection!.db.delete(siteSettings).run();
  for (const response of [await read(), await patch({ name: '未初始化' })]) {
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      code: 'SITE_INTERNAL_ERROR',
      message: '站点信息操作失败，请检查服务日志后重试',
    });
  }
  expect(connection!.db.select().from(siteSettings).all()).toEqual([]);
});
