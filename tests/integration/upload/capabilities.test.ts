import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  mediaImages,
  mediaSettings,
} from '../../../src/server/media/schema.ts';
import {
  storageConfigs,
  storageSettings,
} from '../../../src/server/storage/schema.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';

const runtime = vi.hoisted(() => ({ current: null as unknown }));
const verify = vi.hoisted(() => vi.fn());
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => runtime.current,
}));
vi.mock('../../../src/server/identity/tokens.ts', () => ({
  verifyUploadToken: verify,
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error() {} }),
}));
import { publicUploadCapabilitiesResponse } from '../../../src/server/upload/capabilities.ts';
import {
  publicUploadCapabilitiesErrorSchema,
  publicUploadCapabilitiesSchema,
} from '../../../src/server/upload/public-contract.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
  runtime.current = { connection: { db: fixture.db } };
  verify.mockReset().mockResolvedValue({ tokenId: 'upload-only' });
});
afterEach(() => fixture.close());
const request = () =>
  new Request('https://ariso.example/api/upload/capabilities');

it('returns only current upload capabilities and does not read or expose storage credentials', async () => {
  fixture.db
    .update(uploadSettings)
    .set({ maxFileBytes: 61 * 1048576, queueLimit: 600 })
    .where(eq(uploadSettings.id, 1))
    .run();
  fixture.db
    .update(mediaSettings)
    .set({ defaultVisibility: 'private', defaultLinkVersion: 'watermark' })
    .where(eq(mediaSettings.id, 1))
    .run();
  fixture.db
    .update(storageConfigs)
    .set({
      name: 'private-storage-label',
      accessKeyEncrypted: 'private-credential',
      localPath: '/private/storage-root',
    })
    .where(eq(storageConfigs.id, fixture.storage.id))
    .run();
  const response = await publicUploadCapabilitiesResponse(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body).toEqual({
    maxFileBytes: 61 * 1048576,
    queueLimit: 600,
    defaultVisibility: 'private',
    defaultLinkVersion: 'watermark',
    defaultStorageAvailable: true,
    requestId: expect.any(String),
  });
  expect(publicUploadCapabilitiesSchema.safeParse(body).success).toBe(true);
  expect(JSON.stringify(body)).not.toMatch(
    /private-storage-label|private-credential|private\/storage-root/,
  );
  expect(fixture.db.select().from(mediaImages).all()).toEqual([]);
});

it.each(['unset', 'disabled'] as const)(
  'reports an %s default without failing over to another storage',
  async (mode) => {
    if (mode === 'unset')
      fixture.db
        .update(storageSettings)
        .set({ defaultStorageId: null })
        .where(eq(storageSettings.id, 1))
        .run();
    else
      fixture.db
        .update(storageConfigs)
        .set({ enabled: false })
        .where(eq(storageConfigs.id, fixture.storage.id))
        .run();
    const response = await publicUploadCapabilitiesResponse(request());
    expect(response.status).toBe(200);
    expect((await response.json()).defaultStorageAvailable).toBe(false);
  },
);

it('authenticates before accessing runtime settings', async () => {
  verify.mockResolvedValue(null);
  runtime.current = null;
  const response = await publicUploadCapabilitiesResponse(request());
  expect(response.status).toBe(401);
  const body = await response.json();
  expect(body).toMatchObject({
    error: { code: 'UPLOAD_TOKEN_INVALID', stage: 'authentication' },
    requestId: expect.any(String),
  });
  expect(publicUploadCapabilitiesErrorSchema.safeParse(body).success).toBe(
    true,
  );
});

it.each([uploadSettings, mediaSettings, storageSettings])(
  'returns structured 409 after authentication when required settings are missing',
  async (table) => {
    fixture.db.delete(table).run();
    const response = await publicUploadCapabilitiesResponse(request());
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      error: { code: 'UPLOAD_NOT_INITIALIZED', stage: 'capabilities' },
      requestId: expect.any(String),
    });
  },
);

it('preserves a real database failure as a structured 500 instead of inventing capabilities', async () => {
  fixture.db.$client.exec('DROP TABLE upload_settings');
  const response = await publicUploadCapabilitiesResponse(request());
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(publicUploadCapabilitiesErrorSchema.safeParse(body).success).toBe(
    true,
  );
  expect(body).toMatchObject({
    error: { code: 'UPLOAD_CAPABILITIES_FAILED', stage: 'capabilities' },
    requestId: expect.any(String),
  });
  expect(JSON.stringify(body)).not.toContain('upload_settings');
});
