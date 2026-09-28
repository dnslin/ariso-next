import { afterEach, expect, it } from 'vitest';
import { createS3Storage } from '../../../src/server/storage/s3.ts';

const config = {
  id: 'test-storage',
  enabled: true,
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'test-bucket',
  pathPrefix: '照片 + %',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'explicit-access',
    secretAccessKey: 'explicit-secret',
  },
};
const stores: ReturnType<typeof createS3Storage>[] = [];
function storage(overrides = {}) {
  const store = createS3Storage({ ...config, ...overrides });
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
});

it('PUT 只签临时 Key，固定 900 秒并要求原 content-type，无可选空体校验和', async () => {
  const before = Date.now();
  const result = await storage().signUpload(
    'uploads/session/中文 + %2F?.png',
    'image/png',
  );
  const url = new URL(result.url);
  expect(result).toMatchObject({
    method: 'PUT',
    key: 'uploads/session/中文 + %2F?.png',
    headers: { 'content-type': 'image/png' },
  });
  expect(decodeURIComponent(url.pathname)).toBe(
    '/test-bucket/照片 + %/ariso/test-storage/uploads/session/中文 + %2F?.png',
  );
  expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  expect(
    [...url.searchParams.keys()].some((k) =>
      k.toLowerCase().startsWith('x-amz-checksum-'),
    ),
  ).toBe(false);
  expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 899_000);
  expect(result.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 900_000);
});

it.each([
  'images/image/original/file.png',
  'uploads/../images/a',
  'uploads/session',
  '/uploads/session/a',
  'probes/../images/a',
  'uploads/session/./a',
])('拒绝非临时或含路径归一化片段的 PUT %s', async (key) => {
  await expect(storage().signUpload(key, 'image/png')).rejects.toThrow();
});

it('GET/HEAD 分别签名 300 秒，只有 GET 带调用方覆盖值', async () => {
  const store = storage();
  const get = await store.signRead('images/image/original/a.svg', {
    method: 'GET',
    contentType: 'application/octet-stream',
    contentDisposition: 'attachment; filename="a.svg"',
    cacheControl: 'private, no-store, no-transform',
  });
  const head = await store.signRead('images/image/original/a.svg', {
    method: 'HEAD',
  });
  const getUrl = new URL(get.url),
    headUrl = new URL(head.url);
  for (const url of [getUrl, headUrl])
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(getUrl.searchParams.get('response-content-type')).toBe(
    'application/octet-stream',
  );
  expect(getUrl.searchParams.get('response-content-disposition')).toBe(
    'attachment; filename="a.svg"',
  );
  expect(getUrl.searchParams.get('response-cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(
    [...headUrl.searchParams.keys()].some((k) => k.startsWith('response-')),
  ).toBe(false);
  expect(get.method).toBe('GET');
  expect(head.method).toBe('HEAD');
  expect(getUrl.searchParams.get('X-Amz-Signature')).not.toBe(
    headUrl.searchParams.get('X-Amz-Signature'),
  );
});

it('停用配置拒绝签发新地址', async () => {
  const store = storage({ enabled: false });
  await expect(
    store.signUpload('probes/id', 'text/plain'),
  ).rejects.toMatchObject({ code: 'STORAGE_DISABLED' });
  await expect(
    store.signRead('images/a', { method: 'HEAD' }),
  ).rejects.toMatchObject({ code: 'STORAGE_DISABLED' });
});

it('显式凭据缺失立即失败，不调用环境默认凭据链', () => {
  expect(() =>
    storage({ credentials: { accessKeyId: '', secretAccessKey: '' } }),
  ).toThrow();
});
