import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  probeMediaRateLimit,
  mediaRetryAt,
} from '../../../src/components/sharing/media-rate-limit';

const fetcher = vi.fn();
const origin = 'https://images.example.test';
beforeEach(() => {
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('checks a failed same-origin image once using HEAD without following the S3 redirect', async () => {
  fetcher.mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: 'https://s3.example.test/presigned' },
    }),
  );
  const signal = new AbortController().signal;
  expect(
    await probeMediaRateLimit('/i/image?type=original', origin, signal),
  ).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith(`${origin}/i/image?type=original`, {
    method: 'HEAD',
    redirect: 'manual',
    cache: 'no-store',
    signal,
  });
});

it('returns a retry deadline only when the probe confirms 429', async () => {
  fetcher.mockResolvedValue(
    new Response(null, { status: 429, headers: { 'retry-after': '2' } }),
  );
  expect(
    await probeMediaRateLimit('/i/image', origin, new AbortController().signal),
  ).toBe(12_000);
  expect(fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('never probes cross-origin storage URLs', async () => {
  expect(
    await probeMediaRateLimit(
      'https://s3.example.test/presigned',
      origin,
      new AbortController().signal,
    ),
  ).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it('ignores a late 429 after the image changes or viewer closes', async () => {
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const controller = new AbortController();
  const result = probeMediaRateLimit('/i/old-image', origin, controller.signal);
  controller.abort();
  resolve(
    new Response(null, { status: 429, headers: { 'retry-after': '30' } }),
  );
  expect(await result).toBeNull();
});

it('does not reinterpret an unconfirmed network failure as rate limiting', async () => {
  fetcher.mockRejectedValue(new TypeError('network failed'));
  expect(
    await probeMediaRateLimit('/i/image', origin, new AbortController().signal),
  ).toBeNull();
});

it('supports seconds or HTTP-date Retry-After and defaults an omitted value to the server one-second policy', () => {
  expect(mediaRetryAt(new Response(null, { status: 429 }))).toBe(11_000);
  expect(
    mediaRetryAt(
      new Response(null, {
        status: 429,
        headers: { 'retry-after': 'Thu, 01 Jan 1970 00:00:20 GMT' },
      }),
    ),
  ).toBe(20_000);
  expect(mediaRetryAt(new Response(null, { status: 200 }))).toBeNull();
});
