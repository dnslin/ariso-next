import { expect, it, vi } from 'vitest';
import {
  ownerShareResponse,
  shareBody,
} from '../../../src/server/sharing/http.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: async () => {
    throw Object.assign(new Error('请先登录'), {
      code: 'UNAUTHORIZED',
      status: 401,
    });
  },
}));

it.each([undefined, '1'])(
  'rejects oversized streamed sharing JSON with Content-Length %s',
  async (length) => {
    const request = new Request('http://localhost/s/missing/unlock', {
      method: 'POST',
      headers: length ? { 'content-length': length } : {},
      body: JSON.stringify({ password: 'x'.repeat(256 * 1024) }),
    });
    await expect(shareBody(request)).rejects.toMatchObject({
      code: 'SHARING_INVALID_INPUT',
      status: 413,
      message: '请求内容超过 256 KiB',
    });
  },
);

it('preserves the sharing malformed JSON error', async () => {
  await expect(
    shareBody(new Request('http://localhost', { method: 'POST', body: '{' })),
  ).rejects.toMatchObject({
    code: 'SHARING_INVALID_INPUT',
    status: 400,
    message: '请求内容必须是有效的 JSON',
  });
});

it('rejects an unauthenticated owner operation before consuming JSON', async () => {
  let reads = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(256 * 1024 + 1));
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request('http://localhost/api/albums/a/share', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  const response = await ownerShareResponse(request, () => shareBody(request));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  expect(reads).toBe(0);
  await body.cancel();
});
