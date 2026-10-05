import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuth } from '../../../src/server/identity/auth.ts';
import { apikey, session, user } from '../../../src/server/identity/schema.ts';
import { verifyUploadToken } from '../../../src/server/identity/tokens.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { parseRuntimeEnv } from '../../../src/server/runtime/env.ts';
import { resolveUploadStorage } from '../../../src/server/storage/defaults.ts';
import {
  uploadSessions,
  uploadSubmissions,
} from '../../../src/server/upload/schema.ts';
import { launch, stop } from '../runtime/process-helpers.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';

type TokenRecord = {
  id: string;
  name: string | null;
  enabled: boolean;
  createdAt: string;
  expiresAt: string | null;
};
type CreatedToken = { token: TokenRecord; key: string };
let directory: string;
let server: Awaited<ReturnType<typeof launch>>;
let connection: ReturnType<typeof openRuntimeDatabase>;
let env: Record<string, string>;
let origin: string;
let cookie: string;
let ownerId: string;
let auth: NonNullable<ReturnType<typeof getAuth>>;
let requestIp = 0;

function request(
  path: string,
  method = 'GET',
  body?: object | string,
  headers: Record<string, string> = {},
) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      cookie,
      origin,
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${++requestIp % 255}`,
      ...headers,
    },
    ...(body !== undefined && {
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}
async function login() {
  const response = await request('/api/auth/sign-in/email', 'POST', {
    email,
    password,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toContain('ariso.session_token=');
}
async function create(body: object = { name: 'upload-client' }) {
  const response = await request('/api/upload-tokens', 'POST', body);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.getSetCookie()).toEqual([]);
  return (await response.json()) as CreatedToken;
}
function verify(
  key?: string,
  method = 'POST',
  path = '/api/upload',
  headers: Record<string, string> = {},
) {
  return verifyUploadToken(
    new Request(`${origin}${path}`, {
      method,
      headers: {
        ...(key !== undefined && { authorization: `Bearer ${key}` }),
        ...headers,
      },
    }),
    auth,
  );
}
async function verifyInProcess(key: string) {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [
      resolve('tests/integration/identity/tokens-verify-process.ts'),
      JSON.stringify({
        url: `${origin}/api/upload`,
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
      }),
    ],
    { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10000 },
  );
  const result = JSON.parse(
    stdout
      .split('\n')
      .find((line) => line.startsWith('TOKEN_RESULT '))!
      .slice('TOKEN_RESULT '.length),
  );
  return { result, diagnostics: stdout + stderr };
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
function tokenRows() {
  return connection.db.select().from(apikey).all();
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-production-tokens-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  cookie = '';
  server = await launch(resolve('.next/standalone'), directory, env);
  origin = `http://127.0.0.1:${server.port}`;
  await ready();
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
}, 30000);
afterEach(async () => {
  vi.useRealTimers();
  try {
    if (server) await stop(server.child, server.closed);
  } finally {
    connection?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it('uninitialized token management requires a Cookie and does not create identity or credentials', async () => {
  for (const [path, method, body] of [
    ['/api/upload-tokens', 'GET', undefined],
    ['/api/upload-tokens', 'POST', { name: 'denied' }],
    ['/api/upload-tokens/absent', 'PATCH', { enabled: true }],
    ['/api/upload-tokens/absent', 'DELETE', undefined],
  ] as const) {
    const response = await request(path, method, body);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(connection.db.select().from(user).all()).toEqual([]);
  expect(tokenRows()).toEqual([]);
});

describe('production Cookie Token management and upload-only verifier', () => {
  beforeEach(async () => {
    ownerId = await seedAuthOwner(connection, origin);
    auth = getAuth({ connection, config: parseRuntimeEnv(env) })!;
    await login();
  });

  it('returns plaintext only on create, stores the fixed permission hash, survives restart and has no ten-use limit', async () => {
    const created = await create({ name: ' CLI ' });
    const second = await create({ name: 'second-client' });
    const row = tokenRows().find((entry) => entry.id === created.token.id)!;
    expect(created.token.name).toBe('CLI');
    expect(row).toMatchObject({
      referenceId: ownerId,
      key: createHash('sha256').update(created.key).digest('base64url'),
      start: null,
      prefix: null,
      expiresAt: null,
      rateLimitEnabled: false,
      remaining: null,
      permissions: JSON.stringify({ upload: ['create'] }),
    });
    expect(JSON.stringify(row)).not.toContain(created.key);
    for (const filename of await readdir(env.DATA_DIR))
      if (filename.startsWith('ariso.db'))
        expect(
          (await readFile(join(env.DATA_DIR, filename))).includes(
            Buffer.from(created.key),
          ),
        ).toBe(false);
    for (let attempt = 0; attempt < 15; attempt++)
      expect(await verify(created.key)).toEqual({
        tokenId: created.token.id,
        ownerId,
      });
    const list = await request('/api/upload-tokens');
    expect(list.headers.get('cache-control')).toBe('no-store');
    const listed = (await list.json()).tokens as TokenRecord[];
    expect(listed).toHaveLength(2);
    for (const record of listed)
      expect(Object.keys(record).sort()).toEqual([
        'createdAt',
        'enabled',
        'expiresAt',
        'id',
        'name',
      ]);
    expect(JSON.stringify(listed)).not.toContain(created.key);
    expect(JSON.stringify(listed)).not.toContain(row.key);
    env.PORT = String(server.port);
    await stop(server.child, server.closed);
    env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
    server = await launch(resolve('.next/standalone'), directory, env);
    await ready();
    expect((await request('/api/upload-tokens')).status).toBe(401);
    expect((await verifyInProcess(created.key)).result).toEqual({
      tokenId: created.token.id,
      ownerId,
    });
    await login();
    expect((await (await request('/api/upload-tokens')).json()).tokens).toEqual(
      listed,
    );
    expect((await verifyInProcess(second.key)).result).not.toBeNull();
  }, 30000);

  it('returns the complete list beyond the library default 100 records', async () => {
    for (let index = 0; index < 105; index++)
      await auth.api.createApiKey({
        body: { userId: ownerId, name: `client-${index}` },
      });
    const response = await request('/api/upload-tokens');
    expect(response.status).toBe(200);
    const { tokens } = await response.json();
    expect(tokens).toHaveLength(105);
    expect(new Set(tokens.map((token: TokenRecord) => token.id))).toEqual(
      new Set(tokenRows().map((token) => token.id)),
    );
  });

  it('forwards the native session renewal Cookie from every management operation', async () => {
    const created = await create();
    const current = connection.db.select().from(session).get()!;
    const day = 86400000;
    for (const [path, method, body] of [
      ['/api/upload-tokens', 'GET', undefined],
      ['/api/upload-tokens', 'POST', { name: 'renewed-create' }],
      [`/api/upload-tokens/${created.token.id}`, 'PATCH', { enabled: false }],
      [`/api/upload-tokens/${created.token.id}`, 'DELETE', undefined],
    ] as const) {
      connection.db
        .update(session)
        .set({ expiresAt: new Date(Date.now() + 4 * day) })
        .run();
      const now = Date.now();
      const response = await request(path, method, body);
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([
        expect.stringContaining('ariso.session_token='),
      ]);
      expect(response.headers.getSetCookie()[0]).toContain('Max-Age=604800');
      expect(response.headers.get('cache-control')).toBe('no-store');
      const renewed = connection.db.select().from(session).all();
      expect(renewed).toHaveLength(1);
      expect(renewed[0].id).toBe(current.id);
      expect(renewed[0].expiresAt.getTime()).toBeGreaterThanOrEqual(
        now + 7 * day,
      );
      cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
    }
  });

  it('supports optional UTC expiry, short and long durations and rejects exactly at expiry without issuing a session', async () => {
    for (const expiresIn of [undefined, 1, 60, 400 * 86400]) {
      const before = Date.now();
      const created = await create({
        name: 'expiry',
        ...(expiresIn !== undefined && { expiresIn }),
      });
      expect(created.token.expiresAt === null).toBe(expiresIn === undefined);
      if (expiresIn !== undefined) {
        expect(created.token.expiresAt).toMatch(/Z$/);
        const expiry = new Date(created.token.expiresAt!).getTime();
        expect(expiry).toBeGreaterThanOrEqual(before + expiresIn * 1000);
        expect(expiry).toBeLessThanOrEqual(Date.now() + expiresIn * 1000);
      }
    }
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    vi.setSystemTime(now);
    const key = await auth.api.createApiKey({
      body: { userId: ownerId, name: 'boundary', expiresIn: 1 },
    });
    const beforeSessions = connection.db.select().from(session).all();
    for (const [offset, valid] of [
      [999, true],
      [1000, false],
      [1001, false],
    ] as const) {
      vi.setSystemTime(now + offset);
      expect((await verify(key.key)) !== null).toBe(valid);
    }
    expect(connection.db.select().from(session).all()).toEqual(beforeSessions);
  });

  it('enable/disable is reversible; revoke cannot restore credentials or delete old images or accepted work', async () => {
    const created = await create();
    const imageId = randomUUID();
    const storage = resolveUploadStorage(connection.db);
    const storageId = storage.id;
    const bytes = await readFile(
      resolve('tests/fixtures/media-formats/source.png'),
    );
    const oldObjects = join(
      env.DATA_DIR,
      'storage',
      storage.localPath!,
      'ariso',
      storage.id,
      'old',
    );
    await mkdir(oldObjects, { recursive: true });
    await writeFile(join(oldObjects, `${imageId}.png`), bytes);
    connection.db.transaction((tx) => {
      const snapshot = createProcessingSnapshot(tx);
      const accepted = acceptOriginal(tx, {
        imageId,
        storageId,
        key: `old/${imageId}.png`,
        originalName: 'private.png',
        visibility: 'private',
        format: 'PNG',
        mime: 'image/png',
        byteSize: bytes.length,
        snapshot,
        expectedVersions: [],
      });
      tx.update(mediaImages)
        .set({ processingStatus: 'ready', classification: 'static' })
        .where(eq(mediaImages.id, imageId))
        .run();
      tx.update(mediaJobs)
        .set({ status: 'succeeded' })
        .where(eq(mediaJobs.id, accepted.jobId))
        .run();
      const now = new Date();
      const submissionId = randomUUID();
      tx.insert(uploadSubmissions)
        .values({
          id: submissionId,
          requestId: randomUUID(),
          requestInput: '{}',
          source: 'web',
          storageId,
          visibility: 'private',
          snapshot,
          albumIds: [],
          tagIds: [],
          maxFileBytes: 1,
          batchSize: 1,
          queueLimit: 1,
          lastActivityAt: now,
          createdAt: now,
        })
        .run();
      tx.insert(uploadSessions)
        .values({
          id: randomUUID(),
          submissionId,
          queueItemId: randomUUID(),
          groupIndex: 0,
          originalName: 'private.png',
          declaredSize: 1,
          storageId,
          state: 'accepted',
          candidateImageId: imageId,
          imageId,
          jobId: accepted.jobId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
    const deliveryPath = `/i/${imageId}?type=original`;
    const ownerDelivery = await request(deliveryPath);
    expect(ownerDelivery.status).toBe(200);
    expect(Buffer.from(await ownerDelivery.arrayBuffer())).toEqual(bytes);
    const deliveryCredentials: Record<string, string>[] = [
      { cookie: '', authorization: `Bearer ${created.key}` },
      { cookie: '', 'x-api-key': created.key },
      { cookie: `ariso.session_token=${created.key}` },
    ];
    for (const headers of deliveryCredentials)
      expect(
        (await request(deliveryPath, 'GET', undefined, headers)).status,
      ).toBe(401);
    const retained = () => ({
      images: connection.db.select().from(mediaImages).all(),
      objects: connection.db.select().from(mediaObjects).all(),
      jobs: connection.db.select().from(mediaJobs).all(),
      submissions: connection.db.select().from(uploadSubmissions).all(),
      uploads: connection.db.select().from(uploadSessions).all(),
    });
    const before = retained();
    for (const enabled of [false, true]) {
      const response = await request(
        `/api/upload-tokens/${created.token.id}`,
        'PATCH',
        { enabled },
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.token).toMatchObject({ id: created.token.id, enabled });
      expect(result).not.toHaveProperty('key');
      expect((await verify(created.key)) !== null).toBe(enabled);
    }
    expect(
      await (
        await request(`/api/upload-tokens/${created.token.id}`, 'DELETE')
      ).json(),
    ).toEqual({ success: true });
    expect(await verify(created.key)).toBeNull();
    const restored = await request(
      `/api/upload-tokens/${created.token.id}`,
      'PATCH',
      { enabled: true },
    );
    expect(restored.status).toBe(404);
    expect(await restored.json()).toMatchObject({ code: 'KEY_NOT_FOUND' });
    expect(retained()).toEqual(before);
    expect(tokenRows()).toEqual([]);
  });

  it('only Bearer POST /api/upload verifies; Token cannot issue a session or access management', async () => {
    const created = await create();
    const beforeSessions = connection.db.select().from(session).all();
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'])
      expect(await verify(created.key, method)).toBeNull();
    for (const path of ['/api/images', '/api/account', '/api/upload/extra'])
      expect(await verify(created.key, 'POST', path)).toBeNull();
    const missingCredentials: Record<string, string>[] = [
      {},
      { 'x-api-key': created.key },
      { cookie: `ariso.session_token=${created.key}` },
      { authorization: `Bearer ${created.key} extra` },
      { authorization: 'Basic invalid' },
    ];
    for (const headers of missingCredentials)
      expect(
        await verify(undefined, 'POST', '/api/upload', headers),
      ).toBeNull();
    expect(await verify('invalid')).toBeNull();
    const credentialCases: Record<string, string>[] = [
      { authorization: `Bearer ${created.key}` },
      { 'x-api-key': created.key },
      { cookie: `ariso.session_token=${created.key}` },
      { cookie: `share_access=${created.key}` },
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
      for (const [path, method, body] of [
        ['/api/upload-tokens', 'GET', undefined],
        ['/api/upload-tokens', 'POST', { name: 'denied' }],
        [`/api/upload-tokens/${created.token.id}`, 'PATCH', { enabled: false }],
        [`/api/upload-tokens/${created.token.id}`, 'DELETE', undefined],
        ['/api/account', 'GET', undefined],
        ['/api/images', 'GET', undefined],
        ['/api/settings/media', 'PATCH', {}],
        ['/api/images/absent', 'PATCH', { name: 'denied' }],
        ['/api/images/absent', 'DELETE', undefined],
      ] as const)
        expect((await request(path, method, body, headers)).status).toBe(401);
    }
    expect(connection.db.select().from(session).all()).toEqual(beforeSessions);
    expect(tokenRows()).toHaveLength(1);
  });

  it('keeps all generic plugin endpoints closed for every method even to an owner', async () => {
    const created = await create();
    const before = tokenRows();
    for (const path of [
      'create',
      'get',
      'list',
      'update',
      'delete',
      'verify',
      'delete-all-expired-api-keys',
    ])
      for (const method of [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
      ])
        expect(
          (await request(`/api/auth/api-key/${path}`, method)).status,
        ).toBe(404);
    expect(tokenRows()).toEqual(before);
    expect(await verify(created.key)).not.toBeNull();
  });

  it('rejects malformed and privileged input, wrong origins and stale Cookies without changing Token rows', async () => {
    const created = await create();
    const before = tokenRows();
    for (const input of [
      {},
      { name: '' },
      { name: '  ' },
      { name: 'x'.repeat(33) },
      { name: 'bad', expiresIn: 0 },
      { name: 'bad', expiresIn: -1 },
      { name: 'bad', expiresIn: 0.5 },
      { name: 'bad', expiresIn: 1e20 },
      { name: 'bad', expiresIn: Number.MAX_VALUE },
      { name: 'bad', expiresIn: null },
      { name: 'bad', expiresIn: '60' },
      { name: 'bad', userId: 'other' },
      { name: 'bad', permissions: { upload: ['delete'] } },
      { name: 'bad', disableKeyHashing: true },
      { name: 'bad', prefix: 'plain' },
      { name: 'bad', rateLimitEnabled: true },
      '{',
      'null',
      '[]',
      '{"name":"bad","expiresIn":1e999}',
    ]) {
      const response = await request('/api/upload-tokens', 'POST', input);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'INVALID_UPLOAD_TOKEN_INPUT',
      });
    }
    for (const body of [
      {},
      { enabled: 'false' },
      { enabled: true, permissions: {} },
    ])
      expect(
        (await request(`/api/upload-tokens/${created.token.id}`, 'PATCH', body))
          .status,
      ).toBe(400);
    for (const badOrigin of ['', 'https://foreign.example'])
      for (const [path, method, body] of [
        ['/api/upload-tokens', 'POST', { name: 'denied' }],
        [`/api/upload-tokens/${created.token.id}`, 'PATCH', { enabled: false }],
        [`/api/upload-tokens/${created.token.id}`, 'DELETE', undefined],
      ] as const)
        expect(
          (await request(path, method, body, { origin: badOrigin })).status,
        ).toBe(403);
    expect(tokenRows()).toEqual(before);
    connection.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .run();
    expect((await request('/api/upload-tokens')).status).toBe(401);
    expect(
      (await request('/api/upload-tokens', 'POST', { name: 'denied' })).status,
    ).toBe(401);
    expect(tokenRows()).toEqual(before);
  });

  it.each(['INSERT', 'UPDATE', 'DELETE'])(
    'management %s failures retain real diagnosis without credentials and allow explicit retry',
    async (operation) => {
      const created = await create();
      const before = tokenRows();
      const path =
        operation === 'INSERT'
          ? '/api/upload-tokens'
          : `/api/upload-tokens/${created.token.id}`;
      const method =
        operation === 'INSERT'
          ? 'POST'
          : operation === 'UPDATE'
            ? 'PATCH'
            : 'DELETE';
      const body =
        operation === 'INSERT' ? { name: 'retry' } : { enabled: false };
      const offset = server.logs().length;
      connection.db.$client.exec(
        `CREATE TRIGGER reject_token_management BEFORE ${operation} ON apikey BEGIN SELECT RAISE(ABORT, 'injected Token ${operation} failure'); END`,
      );
      try {
        const response = await request(path, method, body);
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({
          code: 'INTERNAL_SERVER_ERROR',
        });
        await vi.waitFor(() =>
          expect(server.logs().slice(offset)).toContain(
            `injected Token ${operation} failure`,
          ),
        );
        expect(server.logs().slice(offset)).toContain(env.DATA_DIR);
        for (const secret of [
          created.key,
          cookie,
          password,
          env.BETTER_AUTH_SECRET,
          env.ARISO_ENCRYPTION_KEY,
        ])
          expect(server.logs().slice(offset)).not.toContain(secret);
        expect(tokenRows()).toEqual(before);
      } finally {
        connection.db.$client.exec('DROP TRIGGER reject_token_management');
      }
      expect((await request(path, method, body)).status).toBe(200);
    },
  );

  it('verification read/write faults are invalid with real logs, preserve data and recover with the same credential', async () => {
    const created = await create();
    connection.db.$client.exec(
      'ALTER TABLE apikey RENAME TO unavailable_apikey',
    );
    try {
      const result = await verifyInProcess(created.key);
      expect(result.result).toBeNull();
      expect(result.diagnostics).toContain('no such table: apikey');
      for (const secret of [created.key, cookie, password])
        expect(result.diagnostics).not.toContain(secret);
    } finally {
      connection.db.$client.exec(
        'ALTER TABLE unavailable_apikey RENAME TO apikey',
      );
    }
    connection.db.$client.exec(
      "CREATE TRIGGER reject_token_usage BEFORE UPDATE ON apikey BEGIN SELECT RAISE(ABORT, 'injected Token usage failure'); END",
    );
    const before = tokenRows();
    try {
      const result = await verifyInProcess(created.key);
      expect(result.result).toBeNull();
      expect(result.diagnostics).toContain('injected Token usage failure');
      expect(result.diagnostics).not.toContain(created.key);
      expect(tokenRows()).toEqual(before);
    } finally {
      connection.db.$client.exec('DROP TRIGGER reject_token_usage');
    }
    expect((await verifyInProcess(created.key)).result).toEqual({
      tokenId: created.token.id,
      ownerId,
    });
  }, 30000);

  it('refuses a stored key missing upload:create and enabling an expired key cannot revive it', async () => {
    const wrong = await auth.api.createApiKey({
      body: {
        userId: ownerId,
        name: 'wrong-permission',
        permissions: { library: ['read'] },
      },
    });
    expect(await verify(wrong.key)).toBeNull();
    const expired = await create({ name: 'expired' });
    connection.db
      .update(apikey)
      .set({ expiresAt: new Date(Date.now() - 1), enabled: false })
      .where(eq(apikey.id, expired.token.id))
      .run();
    const response = await request(
      `/api/upload-tokens/${expired.token.id}`,
      'PATCH',
      { enabled: true },
    );
    expect([200, 404]).toContain(response.status);
    expect(await verify(expired.key)).toBeNull();
  });
});
