import { afterAll, beforeAll, expect, it } from 'vitest';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { publicUploadFixture } from './api-fixture.ts';
import { packagedPicgo } from './picgo-fixture.ts';
import { verifyPicgoUploads } from './picgo-scenarios.ts';

let packaged: Awaited<ReturnType<typeof packagedPicgo>>;
beforeAll(async () => {
  packaged = await packagedPicgo();
}, 30000);
afterAll(async () => {
  await packaged?.close();
});

it('loads the packed distributable through real PicGo Core plugin discovery', () => {
  const { client } = packaged.createClient({
    siteUrl: 'http://127.0.0.1',
    token: 'not-used',
  });
  expect(client.helper.uploader.getIdList()).toContain('ariso');
  expect(packaged.files).toContain('README.md');
  expect(packaged.files).toContain('LICENSE');
});

it('uploads through the packed plugin, real Core lifecycle and isolated Local HTTP API', async () => {
  const fixture = await publicUploadFixture();
  try {
    const storage = fixture.connection.db.select().from(storageConfigs).get()!;
    const checks = await verifyPicgoUploads(fixture, packaged, storage.id);
    expect(checks).toHaveLength(11);
  } finally {
    await fixture.close();
  }
}, 180000);
