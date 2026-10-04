import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedOwner } from '../../experiments/identity/fixture.ts';
import { session } from '../../experiments/identity/schema.ts';
import { openKeyFixture } from '../../experiments/api-key/fixture.ts';
import { startKeyHttp } from '../../experiments/api-key/http-server.ts';
import { apikey } from '../../experiments/api-key/schema.ts';

let directory: string;
let connection: ReturnType<typeof openKeyFixture>;
let server: Awaited<ReturnType<typeof startKeyHttp>>;
let cookie: string;
let ownerId: string;
let diagnostics: string[];
const logger = {
  log(level: string, message: string, ...args: unknown[]) {
    diagnostics.push(inspect({ level, message, args }));
  },
};
let ip = 0;
const email = 'owner@example.test';
const password = 'api-key-http-experiment-password';
type CreatedKey = { id: string; key: string; expiresAt: string | null };

function request(
  path: string,
  method = 'GET',
  body?: object | string,
  headers: Record<string, string> = {},
) {
  return fetch(`${server.origin}${path}`, {
    method,
    headers: {
      origin: server.origin,
      cookie,
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${++ip}`,
      ...headers,
    },
    ...(body !== undefined && {
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    signal: AbortSignal.timeout(10000),
  });
}
async function create(body: object = { name: 'upload-client' }) {
  const response = await request('/api/upload-tokens', 'POST', body);
  expect(response.status).toBe(200);
  return (await response.json()) as CreatedKey;
}
const upload = (key?: string) =>
  request(
    '/probe/upload',
    'POST',
    {},
    {
      cookie: '',
      ...(key !== undefined && { authorization: `Bearer ${key}` }),
    },
  );

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-api-key-http-'));
  connection = openKeyFixture(join(directory, 'auth.db'));
  ownerId = await seedOwner(connection.db, email, password);
  diagnostics = [];
  server = await startKeyHttp(
    connection.db,
    randomBytes(32).toString('hex'),
    logger,
  );
  cookie = '';
  const login = await request('/api/auth/sign-in/email', 'POST', {
    email,
    password,
  });
  expect(login.status).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toContain('ariso-identity-experiment.session_token=');
});
afterEach(async () => {
  vi.useRealTimers();
  try {
    await server?.close();
  } finally {
    connection?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

it('Cookie management returns plaintext once, sanitizes later reads, persists across reopening and enables/disables/revokes independently', async () => {
  const first = await create();
  const second = await create({ name: 'second-client' });
  expect(first.key).not.toBe(second.key);
  const row = connection.db
    .select()
    .from(apikey)
    .all()
    .find((key) => key.id === first.id)!;
  expect(row.referenceId).toBe(ownerId);
  expect(await (await upload(first.key)).json()).toEqual({
    authorizationAccepted: true,
  });
  for (let i = 0; i < 14; i++)
    expect((await upload(first.key)).status).toBe(200);
  const listResponse = await request('/api/upload-tokens');
  expect(listResponse.headers.get('cache-control')).toBe('no-store');
  const list = await listResponse.json();
  expect(list).toHaveLength(2);
  for (const entry of list) {
    expect(Object.keys(entry).sort()).toEqual([
      'createdAt',
      'enabled',
      'expiresAt',
      'id',
      'name',
    ]);
  }
  const headers = new Headers({ cookie });
  const rawRead = await server.auth.api.getApiKey({
    headers,
    query: { id: first.id },
  });
  expect(rawRead).not.toHaveProperty('key');
  expect(JSON.stringify([list, rawRead])).not.toContain(first.key);
  expect(JSON.stringify(list)).not.toContain(row.key);
  await server.close();
  connection.close();
  connection = openKeyFixture(join(directory, 'auth.db'));
  server = await startKeyHttp(
    connection.db,
    randomBytes(32).toString('hex'),
    logger,
  );
  // Secret rotation invalidates Cookie; API keys remain usable with persisted hashes.
  expect((await upload(first.key)).status).toBe(200);
  const login = await request(
    '/api/auth/sign-in/email',
    'POST',
    { email, password },
    { cookie: '' },
  );
  expect(login.status).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  for (const enabled of [false, true]) {
    const updated = await request(`/api/upload-tokens/${first.id}`, 'PATCH', {
      enabled,
    });
    expect(updated.status).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody).toMatchObject({ id: first.id, enabled });
    expect(updatedBody).not.toHaveProperty('key');
    expect((await upload(first.key)).status).toBe(enabled ? 200 : 401);
    expect((await upload(second.key)).status).toBe(200);
  }
  expect(
    await (await request(`/api/upload-tokens/${first.id}`, 'DELETE')).json(),
  ).toEqual({ success: true });
  expect((await upload(first.key)).status).toBe(401);
  expect(
    (
      await request(`/api/upload-tokens/${first.id}`, 'PATCH', {
        enabled: true,
      })
    ).status,
  ).toBe(404);
  expect((await upload(second.key)).status).toBe(200);
  expect(await (await request('/api/upload-tokens')).json()).toHaveLength(1);
  expect(diagnostics.join('\n')).not.toContain(first.key);
});

it.each([undefined, 1, 60, 400 * 86400])(
  'HTTP creation supports expiresIn=%s seconds with an optional UTC expiry',
  async (expiresIn) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    vi.setSystemTime(now);
    const key = await create({
      name: 'expiry-test',
      ...(expiresIn !== undefined && { expiresIn }),
    });
    expect(key.expiresAt).toBe(
      expiresIn === undefined
        ? null
        : new Date(now + expiresIn * 1000).toISOString(),
    );
    expect((await upload(key.key)).status).toBe(200);
  },
);

it('HTTP upload rejects exactly at expiry and after expiry without creating a session', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const now = Date.now();
  vi.setSystemTime(now);
  const key = await create({ name: 'expiry-boundary', expiresIn: 1 });
  const before = connection.db.select().from(session).all();
  for (const [offset, status] of [
    [999, 200],
    [1000, 401],
    [1001, 401],
  ]) {
    vi.setSystemTime(now + offset);
    const response = await upload(key.key);
    expect(response.status).toBe(status);
    expect(response.headers.getSetCookie()).toEqual([]);
  }
  expect(connection.db.select().from(session).all()).toEqual(before);
});

it('only Bearer POST passes the upload probe; API key headers do not create a Cookie session or grant owner access', async () => {
  const key = await create();
  const before = connection.db.select().from(session).all();
  const credentialCases: Record<string, string>[] = [
    {},
    { authorization: `Bearer ${key.key}` },
    { 'x-api-key': key.key },
    { cookie: `ariso-identity-experiment.session_token=${key.key}` },
  ];
  for (const credentials of credentialCases) {
    const headers = { cookie: '', ...credentials };
    const sessionResponse = await request(
      '/api/auth/get-session',
      'GET',
      undefined,
      headers,
    );
    expect(await sessionResponse.json()).toBeNull();
    expect(sessionResponse.headers.getSetCookie()).toEqual([]);
    for (const method of ['GET', 'PATCH', 'DELETE'])
      expect(
        (await request('/probe/owner', method, undefined, headers)).status,
      ).toBe(401);
    expect(
      (await request('/api/upload-tokens', 'GET', undefined, headers)).status,
    ).toBe(401);
    expect(
      (
        await request(
          '/api/upload-tokens',
          'POST',
          { name: 'forbidden' },
          headers,
        )
      ).status,
    ).toBe(401);
    for (const method of ['PATCH', 'DELETE'])
      expect(
        (
          await request(
            `/api/upload-tokens/${key.id}`,
            method,
            { enabled: false },
            headers,
          )
        ).status,
      ).toBe(401);
  }
  expect((await upload(key.key)).status).toBe(200);
  expect((await upload()).status).toBe(401);
  expect((await upload('invalid-key')).status).toBe(401);
  expect(
    (
      await request(
        '/probe/upload',
        'POST',
        {},
        { cookie: '', 'x-api-key': key.key },
      )
    ).status,
  ).toBe(401);
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'])
    expect(
      (
        await request('/probe/upload', method, undefined, {
          cookie: '',
          authorization: `Bearer ${key.key}`,
        })
      ).status,
    ).toBe(404);
  for (const method of ['GET', 'PATCH', 'DELETE'])
    expect((await request('/probe/owner', method)).status).toBe(200);
  expect(connection.db.select().from(session).all()).toEqual(before);
  expect(connection.db.select().from(apikey).all()).toHaveLength(1);
});

it('generic plugin endpoints are never exposed, even to the owner; malformed methods and trailing path variants remain closed', async () => {
  const key = await create();
  const before = connection.db.select().from(apikey).all();
  for (const path of [
    'create',
    'get',
    'list',
    'update',
    'delete',
    'verify',
    'delete-all-expired-api-keys',
  ]) {
    for (const method of [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ]) {
      const response = await request(`/api/auth/api-key/${path}`, method);
      expect(response.status).toBe(404);
    }
  }
  for (const path of [
    '/api/auth/api-key/create/',
    '/api/auth/api-key/%63reate',
    '/api/auth/api-key/create/extra',
    '/api/auth/sign-in/email/',
  ])
    expect((await request(path, 'POST')).status).toBe(404);
  expect(connection.db.select().from(apikey).all()).toEqual(before);
  expect((await upload(key.key)).status).toBe(200);
});

it.each([
  { name: '' },
  { name: '  ' },
  { name: 'x'.repeat(33) },
  {},
  { name: 'bad', expiresIn: 0 },
  { name: 'bad', expiresIn: -1 },
  { name: 'bad', expiresIn: 0.5 },
  { name: 'bad', expiresIn: 1e20 },
  { name: 'bad', expiresIn: Number.MAX_VALUE },
  { name: 'bad', expiresIn: null },
  { name: 'bad', expiresIn: 'Infinity' },
  { name: 'bad', userId: 'other' },
  { name: 'bad', permissions: { upload: ['delete'] } },
  { name: 'bad', disableKeyHashing: true },
  { name: 'bad', rateLimitEnabled: true },
  '{',
  '{"name":"bad","expiresIn":1e999}',
])(
  'management rejects invalid or privileged input %j without inserting keys',
  async (body) => {
    expect((await request('/api/upload-tokens', 'POST', body)).status).toBe(
      400,
    );
    expect(connection.db.select().from(apikey).all()).toEqual([]);
  },
);

it('Cookie management checks origin and cannot override fixed permissions through server API headers', async () => {
  const key = await create();
  for (const origin of ['', 'https://foreign.example']) {
    expect(
      (
        await request(
          '/api/upload-tokens',
          'POST',
          { name: 'bad-origin' },
          { origin },
        )
      ).status,
    ).toBe(403);
    for (const method of ['PATCH', 'DELETE'])
      expect(
        (
          await request(
            `/api/upload-tokens/${key.id}`,
            method,
            { enabled: false },
            { origin },
          )
        ).status,
      ).toBe(403);
  }
  expect(
    (
      await request(`/api/upload-tokens/${key.id}`, 'PATCH', {
        enabled: false,
        permissions: {},
      })
    ).status,
  ).toBe(400);
  await expect(
    server.auth.api.createApiKey({
      headers: new Headers({ cookie }),
      body: { name: 'server-only', permissions: { upload: ['create'] } },
    }),
  ).rejects.toMatchObject({ body: { code: 'SERVER_ONLY_PROPERTY' } });
  expect(connection.db.select().from(apikey).all()).toHaveLength(1);
  expect((await upload(key.key)).status).toBe(200);
});

it.each(['INSERT', 'UPDATE', 'DELETE'])(
  'management %s failure is reported, preserves data and permits explicit retry',
  async (operation) => {
    const key = await create();
    const before = connection.db.select().from(apikey).all();
    const path =
      operation === 'INSERT'
        ? '/api/upload-tokens'
        : `/api/upload-tokens/${key.id}`;
    const method =
      operation === 'INSERT'
        ? 'POST'
        : operation === 'UPDATE'
          ? 'PATCH'
          : 'DELETE';
    const body =
      operation === 'INSERT' ? { name: 'retry-create' } : { enabled: false };
    connection.db.$client.exec(
      `CREATE TRIGGER reject_key_management BEFORE ${operation} ON apikey BEGIN SELECT RAISE(ABORT, 'injected key ${operation} failure'); END`,
    );
    try {
      const failed = await request(path, method, body);
      expect(failed.status).toBe(500);
      expect(diagnostics.join('\n')).toContain(
        `injected key ${operation} failure`,
      );
      expect(connection.db.select().from(apikey).all()).toEqual(before);
      for (const sensitive of [key.key, password, cookie])
        expect(diagnostics.join('\n')).not.toContain(sensitive);
    } finally {
      connection.db.$client.exec('DROP TRIGGER reject_key_management');
    }
    expect((await request(path, method, body)).status).toBe(200);
  },
);

it('verification database failure is HTTP 401 with diagnosis, and the same key works after repair', async () => {
  const key = await create();
  connection.db.$client.exec('ALTER TABLE apikey RENAME TO unavailable_apikey');
  try {
    expect((await upload(key.key)).status).toBe(401);
    expect(diagnostics.join('\n')).toContain('no such table: apikey');
    expect(diagnostics.join('\n')).not.toContain(key.key);
  } finally {
    connection.db.$client.exec(
      'ALTER TABLE unavailable_apikey RENAME TO apikey',
    );
  }
  expect((await upload(key.key)).status).toBe(200);
});

it('generated table remains identical to the pinned CLI schema and a reopened fixture applies no extra migrations', async () => {
  const generated = readFileSync(
    'docs/tasks/evidence/EV-IDENTITY-02/generated-schema.ts',
    'utf8',
  );
  const runtimeSchema = readFileSync(
    'tests/experiments/api-key/schema.ts',
    'utf8',
  );
  const declaration = generated
    .slice(
      generated.indexOf('export const apikey'),
      generated.indexOf('export const userRelations'),
    )
    .trim();
  expect(
    runtimeSchema.slice(runtimeSchema.indexOf('export const apikey')).trim(),
  ).toBe(declaration);
  const reopened = openKeyFixture(join(directory, 'auth.db'));
  try {
    expect(
      reopened.db.$client
        .prepare('SELECT COUNT(*) AS count FROM api_key_experiment_migrations')
        .get(),
    ).toEqual({ count: 1 });
  } finally {
    reopened.close();
  }
});
