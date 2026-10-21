import { afterEach, expect, it, vi } from 'vitest';
import { requestSizeState } from '../../../src/components/library/size-request';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('reads a selected preset without POST and sends explicit generation parameters only when requested', async () => {
  const result = { status: 'missing', links: null };
  const fetch = vi.fn().mockImplementation(async () => Response.json(result));
  vi.stubGlobal('fetch', fetch);
  const input = { version: 'watermark' as const, preset: 'large' as const };
  const signal = new AbortController().signal;
  expect(await requestSizeState('旅行 /', input, 'GET', signal)).toEqual(
    result,
  );
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/images/%E6%97%85%E8%A1%8C%20%2F/sizes?version=watermark&preset=large',
    expect.objectContaining({ method: 'GET', signal }),
  );
  await requestSizeState('one', input, 'POST', signal);
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/images/one/sizes',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    }),
  );
});
it('preserves session expiry even when the server does not return JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('not json', { status: 401 })),
  );
  await expect(
    requestSizeState(
      'one',
      { version: 'compressed', preset: 'small' },
      'GET',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 401 });
});
