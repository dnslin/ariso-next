import { afterEach, expect, it, vi } from 'vitest';
import { createS3Storage } from '../../../src/server/storage/s3.ts';
const official =
  'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
const stores: ReturnType<typeof createS3Storage>[] = [];
function storage(endpoint = official, forcePathStyle = true) {
  const result = createS3Storage({
    id: 'id',
    enabled: false,
    endpoint,
    region: 'auto',
    bucket: 'bucket',
    pathPrefix: '',
    forcePathStyle,
    credentials: { accessKeyId: 'access', secretAccessKey: 'secret' },
  });
  stores.push(result);
  return result;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
  vi.unstubAllGlobals();
});
it('官方 R2 必须确认整个 Bucket 无锁，成功证据不能声称自动检测', async () => {
  const store = storage();
  await expect(store.checkBucket()).rejects.toMatchObject({
    code: 'STORAGE_BUCKET_UNSUPPORTED',
  });
  await expect(
    store.checkBucket({ r2NoBucketLocksConfirmed: true }),
  ).resolves.toMatchObject({
    basis: 'official-capability-and-owner-confirmation',
    automaticVersionOrLockDetection: false,
    r2NoBucketLocksConfirmed: true,
  });
});
it.each([true, false])(
  'R2 官方端点路径风格 %s 严格接受 400 InvalidArgument Authorization',
  async (pathStyle) => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          '<Error><Code>InvalidArgument</Code><Message>Authorization</Message></Error>',
          { status: 400 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      storage(official, pathStyle).checkAnonymous('probes/id'),
    ).resolves.toMatchObject({
      serviceCode: 'InvalidArgument',
      httpStatusCode: 400,
    });
    expect(fetcher.mock.calls).toHaveLength(1);
  },
);
it.each([
  [
    'http://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
    400,
    'Authorization',
  ],
  ['https://public.r2.dev', 400, 'Authorization'],
  [
    'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com.evil.example',
    400,
    'Authorization',
  ],
  [official, 403, 'Authorization'],
  [official, 400, 'Other'],
])('R2 例外不得扩展到 %s %s %s', async (endpoint, status, message) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          `<Error><Code>InvalidArgument</Code><Message>${message}</Message></Error>`,
          { status: Number(status) },
        ),
    ),
  );
  await expect(
    storage(String(endpoint)).checkAnonymous('probes/id'),
  ).rejects.toMatchObject({ operation: 'anonymous-read' });
});
