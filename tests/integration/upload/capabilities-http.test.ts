import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { apikey } from '../../../src/server/identity/schema.ts';
import { mediaSettings } from '../../../src/server/media/schema.ts';
import {
  storageConfigs,
  storageSettings,
} from '../../../src/server/storage/schema.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';
import {
  publicUploadCapabilitiesErrorSchema,
  publicUploadCapabilitiesSchema,
} from '../../../src/server/upload/public-contract.ts';
import { publicUploadFixture } from './api-fixture.ts';

let fixture: Awaited<ReturnType<typeof publicUploadFixture>>;
beforeEach(async () => {
  fixture = await publicUploadFixture();
}, 30000);
afterEach(async () => {
  await fixture?.close();
});
const path = '/api/upload/capabilities';
function read(key: string) {
  return fixture.request(path, { headers: { authorization: `Bearer ${key}` } });
}
async function capabilityError(
  response: Response,
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(publicUploadCapabilitiesErrorSchema.safeParse(body).success).toBe(
    true,
  );
  expect(body).toMatchObject({
    error: { code },
    requestId: expect.any(String),
  });
  return body;
}

it('reads current settings through real HTTP with an upload-only Token', async () => {
  const { key } = await fixture.createToken();
  const db = fixture.connection.db;
  db.update(uploadSettings)
    .set({ maxFileBytes: 71 * 1048576, queueLimit: 700 })
    .where(eq(uploadSettings.id, 1))
    .run();
  db.update(mediaSettings)
    .set({ defaultVisibility: 'private', defaultLinkVersion: 'original' })
    .where(eq(mediaSettings.id, 1))
    .run();
  const response = await read(key);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(publicUploadCapabilitiesSchema.safeParse(body).success).toBe(true);
  expect(body).toEqual({
    maxFileBytes: 71 * 1048576,
    queueLimit: 700,
    defaultVisibility: 'private',
    defaultLinkVersion: 'original',
    defaultStorageAvailable: true,
    requestId: expect.any(String),
  });
  expect(JSON.stringify(body)).not.toContain(key);
  expect(Object.keys(body).sort()).toEqual(
    [
      'maxFileBytes',
      'queueLimit',
      'defaultVisibility',
      'defaultLinkVersion',
      'defaultStorageAvailable',
      'requestId',
    ].sort(),
  );
});

it('rejects missing and invalid Token even when an owner Cookie is present', async () => {
  const cases: HeadersInit[] = [
    {},
    { authorization: 'Bearer invalid-fixture-token' },
    { cookie: fixture.cookie },
    { cookie: fixture.cookie, authorization: 'Bearer invalid-fixture-token' },
  ];
  for (const headers of cases) {
    const body = await capabilityError(
      await fixture.request(path, { headers }),
      401,
      'UPLOAD_TOKEN_INVALID',
    );
    expect(body.error.stage).toBe('authentication');
  }
});

it('rejects disabled, expired, revoked and insufficient-permission Tokens', async () => {
  const disabled = await fixture.createToken({ name: 'disabled' });
  const expired = await fixture.createToken({ name: 'expired' });
  const revoked = await fixture.createToken({ name: 'revoked' });
  const restricted = await fixture.createToken({
    name: 'no-upload-permission',
  });
  const db = fixture.connection.db;
  db.update(apikey)
    .set({ enabled: false })
    .where(eq(apikey.id, disabled.token.id))
    .run();
  db.update(apikey)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(apikey.id, expired.token.id))
    .run();
  db.delete(apikey).where(eq(apikey.id, revoked.token.id)).run();
  db.update(apikey)
    .set({ permissions: JSON.stringify({ upload: ['delete'] }) })
    .where(eq(apikey.id, restricted.token.id))
    .run();
  for (const { key } of [disabled, expired, revoked, restricted])
    await capabilityError(await read(key), 401, 'UPLOAD_TOKEN_INVALID');
});

it('does not grant Token access to any management read', async () => {
  const { key } = await fixture.createToken();
  for (const target of [
    '/api/images',
    '/api/storages',
    '/api/upload-tokens',
    '/upload/settings',
  ]) {
    const response = await fixture.request(target, {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(response.status, target).toBe(401);
  }
  expect(
    (
      await fixture.request(path, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
      })
    ).status,
  ).toBe(405);
});

it('reports disabled or absent default storage as unavailable without falling back', async () => {
  const { key } = await fixture.createToken();
  const db = fixture.connection.db;
  const current = db.select().from(storageSettings).get()!;
  db.update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, current.defaultStorageId!))
    .run();
  expect((await (await read(key)).json()).defaultStorageAvailable).toBe(false);
  db.update(storageSettings)
    .set({ defaultStorageId: null })
    .where(eq(storageSettings.id, 1))
    .run();
  expect((await (await read(key)).json()).defaultStorageAvailable).toBe(false);
});

it('returns 409 for authenticated reads when upload settings are uninitialized', async () => {
  const { key } = await fixture.createToken();
  fixture.connection.db.delete(uploadSettings).run();
  const body = await capabilityError(
    await read(key),
    409,
    'UPLOAD_NOT_INITIALIZED',
  );
  expect(body.error.stage).toBe('capabilities');
});
