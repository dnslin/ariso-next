import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedOwner } from '../../experiments/identity/fixture.ts';
import {
  createKeyAuth,
  openKeyFixture,
  verifyUploadKey,
} from '../../experiments/api-key/fixture.ts';
import { apikey } from '../../experiments/api-key/schema.ts';

let directory: string;
let connection: ReturnType<typeof openKeyFixture>;
let auth: ReturnType<typeof createKeyAuth>;
let userId: string;
let diagnostics: string[];

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-api-key-'));
  connection = openKeyFixture(join(directory, 'auth.db'));
  userId = await seedOwner(
    connection.db,
    'owner@example.test',
    'api-key-experiment-password',
  );
  diagnostics = [];
  auth = createKeyAuth(
    connection.db,
    'http://localhost:3000',
    randomBytes(32).toString('hex'),
    {
      log(level, message, ...args) {
        diagnostics.push(inspect({ level, message, args }));
      },
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  connection?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it('official plugin creates only a hash with upload:create, no partial plaintext or default usage quota', async () => {
  const created = await auth.api.createApiKey({
    body: { userId, name: 'upload-client' },
  });
  const row = connection.db.select().from(apikey).get()!;
  expect(row.key).toBe(
    createHash('sha256').update(created.key).digest('base64url'),
  );
  expect(row).toMatchObject({
    referenceId: userId,
    start: null,
    prefix: null,
    expiresAt: null,
    rateLimitEnabled: false,
    remaining: null,
    permissions: JSON.stringify({ upload: ['create'] }),
  });
  expect(JSON.stringify(row)).not.toContain(created.key);
  for (const file of readdirSync(directory))
    expect(
      readFileSync(join(directory, file)).includes(Buffer.from(created.key)),
    ).toBe(false);
  for (let i = 0; i < 15; i++) {
    expect(
      await auth.api.verifyApiKey({
        body: { key: created.key, permissions: { upload: ['create'] } },
      }),
    ).toMatchObject({ valid: true, error: null, key: { id: created.id } });
  }
});

it('library accepts equality but the upload boundary rejects now >= expiresAt with millisecond precision', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const now = Date.now();
  vi.setSystemTime(now);
  const created = await auth.api.createApiKey({
    body: { userId, name: 'one-second', expiresIn: 1 },
  });
  expect(created.expiresAt!.getTime()).toBe(now + 1000);
  vi.setSystemTime(now + 999);
  expect(await verifyUploadKey(auth, created.key)).toBe(true);
  vi.setSystemTime(now + 1000);
  expect(
    await auth.api.verifyApiKey({ body: { key: created.key } }),
  ).toMatchObject({ valid: true });
  expect(await verifyUploadKey(auth, created.key)).toBe(false);
  vi.setSystemTime(now + 1001);
  expect(
    await auth.api.verifyApiKey({ body: { key: created.key } }),
  ).toMatchObject({ valid: false, error: { code: 'KEY_EXPIRED' } });
  expect(await verifyUploadKey(auth, created.key)).toBe(false);
  expect(connection.db.select().from(apikey).all()).toEqual([]);
});

const forbiddenPermissions: Record<string, string[]>[] = [
  { upload: ['read'] },
  { upload: ['delete'] },
  { library: ['read'] },
  { settings: ['write'] },
];
it.each(forbiddenPermissions)(
  'fixed upload:create cannot satisfy %j',
  async (permissions) => {
    const created = await auth.api.createApiKey({
      body: { userId, name: 'permission-test' },
    });
    const denied = await auth.api.verifyApiKey({
      body: { key: created.key, permissions },
    });
    expect(denied).toMatchObject({
      valid: false,
      key: null,
      error: { code: 'KEY_NOT_FOUND' },
    });
  },
);

it('a stored key without upload:create is refused even when otherwise valid', async () => {
  const created = await auth.api.createApiKey({
    body: {
      userId,
      name: 'wrong-permission',
      permissions: { library: ['read'] },
    },
  });
  expect(
    await auth.api.verifyApiKey({ body: { key: created.key } }),
  ).toMatchObject({ valid: true });
  expect(await verifyUploadKey(auth, created.key)).toBe(false);
});

it('database read/write faults become invalid with the original diagnostic, and recovery accepts the same key', async () => {
  const created = await auth.api.createApiKey({
    body: { userId, name: 'fault-test' },
  });
  connection.db.$client.exec('ALTER TABLE apikey RENAME TO unavailable_apikey');
  try {
    expect(
      await auth.api.verifyApiKey({ body: { key: created.key } }),
    ).toMatchObject({ valid: false, error: { code: 'INVALID_API_KEY' } });
    expect(diagnostics.join('\n')).toContain('no such table: apikey');
  } finally {
    connection.db.$client.exec(
      'ALTER TABLE unavailable_apikey RENAME TO apikey',
    );
  }
  connection.db.$client.exec(
    "CREATE TRIGGER reject_key_usage BEFORE UPDATE ON apikey BEGIN SELECT RAISE(ABORT, 'injected key usage failure'); END",
  );
  try {
    expect(await verifyUploadKey(auth, created.key)).toBe(false);
    expect(diagnostics.join('\n')).toContain('injected key usage failure');
  } finally {
    connection.db.$client.exec('DROP TRIGGER reject_key_usage');
  }
  expect(diagnostics.join('\n')).not.toContain(created.key);
  expect(diagnostics.join('\n')).not.toContain('api-key-experiment-password');
  expect(await verifyUploadKey(auth, created.key)).toBe(true);
});
