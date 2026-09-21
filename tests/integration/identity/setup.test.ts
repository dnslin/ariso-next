import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { launch, stop } from '../runtime/process-helpers.ts';
import { email, password } from './auth-fixture.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>>;
let connection: ReturnType<typeof openRuntimeDatabase>;
let env: Record<string, string>;
const businessTables = ['site_settings', 'media_settings', 'user', 'account'];
function records(table: string) {
  return connection.db.$client.prepare(`SELECT * FROM ${table}`).all();
}
function codes() {
  return server
    .logs()
    .split('\n')
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.module === 'identity.setup' && entry.event === 'setup-code'
          ? [entry.code as string]
          : [];
      } catch {
        return [];
      }
    });
}
function request(path: string, init: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${server.port}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}
function setup(overrides: Record<string, unknown> = {}) {
  return request('/api/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: codes()[0],
      email,
      password,
      publicUrl: `http://127.0.0.1:${server.port}`,
      timeZone: 'Asia/Shanghai',
      ...overrides,
    }),
  });
}
async function ready() {
  await vi.waitFor(
    async () => {
      if (server.child.exitCode !== null) throw new Error(server.logs());
      expect((await request('/api/health')).status).toBe(200);
    },
    { timeout: 15000 },
  );
}
async function restart() {
  env.PORT = String(server.port);
  await stop(server.child, server.closed);
  server = await launch(resolve('.next/standalone'), directory, env);
}
async function completed(response: Response) {
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toEqual({
    code: 'SETUP_COMPLETED',
    redirectTo: '/login',
  });
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(response.headers.get('cache-control')).toBe('no-store');
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-production-setup-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    LOG_LEVEL: 'fatal',
  };
  server = await launch(resolve('.next/standalone'), directory, env);
  await ready();
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
}, 30000);
afterEach(async () => {
  if (server) await stop(server.child, server.closed);
  connection?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('empty production startup prepares storage and prints exactly one code even with fatal logging; HTTP never returns it', async () => {
  expect(codes()).toHaveLength(1);
  const code = codes()[0];
  expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(records('storage_configs')).toHaveLength(1);
  expect(records('storage_settings')).toHaveLength(1);
  for (const table of businessTables) expect(records(table)).toEqual([]);
  for (const path of [
    '/api/health',
    '/setup',
    '/api/setup',
    '/api/auth/get-session',
  ]) {
    const response = await request(path);
    expect(await response.text()).not.toContain(code);
    expect(JSON.stringify([...response.headers])).not.toContain(code);
    if (path === '/api/setup') expect(response.status).toBe(405);
  }
  const invalid = await setup({ code: 'wrong' });
  expect(invalid.status).toBe(401);
  expect(await invalid.json()).toMatchObject({ code: 'INVALID_SETUP_CODE' });
  expect(invalid.headers.getSetCookie()).toEqual([]);
  expect(codes()).toEqual([code]);
  expect(server.logs().split(code)).toHaveLength(2);
});

it.each(['code', 'email', 'password', 'publicUrl', 'timeZone'])(
  'missing %s returns a field error and writes nothing',
  async (field) => {
    const response = await setup({ [field]: undefined });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('INVALID_SETUP_INPUT');
    expect(body.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    for (const table of businessTables) expect(records(table)).toEqual([]);
  },
);

it('concurrent setup commits one complete owner, creates no session, and supports a real password login', async () => {
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => setup({ email: '  OWNER@EXAMPLE.TEST  ' })),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
  for (const response of responses) {
    if (response.status === 200) await completed(response);
    else
      expect(await response.json()).toMatchObject({
        code: 'SETUP_ALREADY_COMPLETED',
        redirectTo: '/login',
      });
    expect(response.headers.getSetCookie()).toEqual([]);
  }
  for (const table of businessTables) expect(records(table)).toHaveLength(1);
  expect(JSON.stringify(businessTables.map(records))).not.toContain(codes()[0]);
  expect(JSON.stringify(businessTables.map(records))).not.toContain(password);
  expect(records('session')).toEqual([]);
  expect(await (await request('/api/auth/get-session')).json()).toBeNull();
  const login = await request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: `http://127.0.0.1:${server.port}`,
    },
    body: JSON.stringify({ email, password }),
  });
  expect(login.status, await login.clone().text()).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token=');
  expect(
    (
      await (
        await request('/api/auth/get-session', { headers: { cookie } })
      ).json()
    ).user.email,
  ).toBe(email);
  expect(server.logs()).not.toContain(password);
});

it.each(businessTables)(
  'a failed %s insert rolls back every business row and the same code can retry',
  async (table) => {
    const code = codes()[0];
    const storage = records('storage_configs');
    connection.db.$client.exec(
      `CREATE TRIGGER reject_setup BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'injected setup failure'); END`,
    );
    try {
      const response = await setup();
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      for (const businessTable of businessTables)
        expect(records(businessTable)).toEqual([]);
      expect(records('storage_configs')).toEqual(storage);
    } finally {
      connection.db.$client.exec('DROP TRIGGER reject_setup');
    }
    await completed(await setup({ code }));
  },
);

it('ignoring the committed response then retrying directs to login; restart issues no code or reset', async () => {
  const code = codes()[0];
  const response = await setup();
  await response.body?.cancel();
  expect(records('user')).toHaveLength(1);
  const before = businessTables.map(records);
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = await setup({ code });
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({
      code: 'SETUP_ALREADY_COMPLETED',
      redirectTo: '/login',
    });
    if (attempt === 0) {
      await restart();
      await ready();
    }
  }
  expect(codes()).toEqual([]);
  expect(businessTables.map(records)).toEqual(before);
});

it('a real uninitialized restart replaces the code and rejects the old one', async () => {
  const oldCode = codes()[0];
  await restart();
  await ready();
  expect(codes()).toHaveLength(1);
  expect(codes()[0]).not.toBe(oldCode);
  const denied = await setup({ code: oldCode });
  expect(denied.status).toBe(401);
  expect(await denied.json()).toMatchObject({ code: 'INVALID_SETUP_CODE' });
  await completed(await setup());
});

it.each(['site_settings', 'account', 'media_settings', 'storage_settings'])(
  'an owner missing %s fails startup with the database path instead of reopening setup',
  async (table) => {
    await completed(await setup());
    connection.db.$client.exec(`DELETE FROM ${table}`);
    await restart();
    await vi.waitFor(
      () => expect(server.child.exitCode, server.logs()).not.toBeNull(),
      {
        timeout: 15000,
      },
    );
    expect(server.child.exitCode).not.toBe(0);
    expect(server.logs()).toContain(join(env.DATA_DIR, 'ariso.db'));
    expect(server.logs()).toContain(table === 'account' ? 'credential' : table);
    expect(codes()).toEqual([]);
    expect(records('user')).toHaveLength(1);
    expect(records(table)).toEqual([]);
  },
  30000,
);

it.each(['cleared', 'disabled'])(
  'a %s default storage is preserved on initialized restart',
  async (state) => {
    await completed(await setup());
    if (state === 'cleared')
      connection.db.$client.exec(
        'UPDATE storage_settings SET default_storage_id = NULL',
      );
    else connection.db.$client.exec('UPDATE storage_configs SET enabled = 0');
    const before = [records('storage_configs'), records('storage_settings')];
    await restart();
    await ready();
    expect(codes()).toEqual([]);
    expect([records('storage_configs'), records('storage_settings')]).toEqual(
      before,
    );
  },
  30000,
);

it.each(['{', 'null', '[]'])(
  'malformed or non-object JSON %s is a client error with no business writes',
  async (body) => {
    const response = await request('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'INVALID_SETUP_INPUT',
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    for (const table of businessTables) expect(records(table)).toEqual([]);
  },
);

it.each([
  ['email', 'not-an-email'],
  ['password', 'short'],
  ['publicUrl', 'https://example.test/subpath'],
  ['timeZone', '+08:00'],
])('invalid %s uses the field validation contract', async (field, value) => {
  const response = await setup({ [field]: value });
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.code).toBe('INVALID_SETUP_INPUT');
  expect(body.fields).toEqual(
    expect.arrayContaining([expect.objectContaining({ field })]),
  );
  for (const table of businessTables) expect(records(table)).toEqual([]);
});

it('a credential write failure logs its diagnostic without passwords, hashes or repeated setup codes', async () => {
  env.LOG_LEVEL = 'error';
  await restart();
  await ready();
  const code = codes()[0];
  const offset = server.logs().length;
  connection.db.$client.exec(
    "CREATE TRIGGER reject_setup BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'injected credential write failure'); END",
  );
  try {
    const response = await setup();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    await vi.waitFor(() =>
      expect(server.logs().slice(offset)).toContain(
        'injected credential write failure',
      ),
    );
    const diagnostic = server.logs().slice(offset);
    expect(diagnostic).toContain(join(env.DATA_DIR, 'ariso.db'));
    expect(diagnostic).not.toContain(password);
    expect(diagnostic).not.toContain(code);
    expect(diagnostic).not.toMatch(/[0-9a-f]{32,64}:[0-9a-f]{128}/i);
    for (const table of businessTables) expect(records(table)).toEqual([]);
  } finally {
    connection.db.$client.exec('DROP TRIGGER reject_setup');
  }
  await completed(await setup({ code }));
});

it('restart preserves changed site/media settings and a deliberately deleted default storage', async () => {
  await completed(await setup());
  connection.db.$client.exec(`
    UPDATE storage_settings SET default_storage_id = NULL;
    DELETE FROM storage_configs;
    UPDATE site_settings SET public_url = 'https://changed.example.test', time_zone = 'UTC';
    UPDATE media_settings SET quality = 62, default_visibility = 'private';
  `);
  const tables = [
    'site_settings',
    'media_settings',
    'storage_settings',
    'storage_configs',
  ];
  const before = tables.map(records);
  await restart();
  await ready();
  expect(codes()).toEqual([]);
  expect(tables.map(records)).toEqual(before);
});
