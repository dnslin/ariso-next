import { afterEach, expect, it, vi } from 'vitest';
import { requestArchivePreparation } from '../../../src/components/library/archive-request';

afterEach(() => vi.unstubAllGlobals());
it('prepares the explicit frozen selection and fixed version without fetching ZIP bytes into a Blob', async () => {
  const result = {
    items: [{ imageId: 'one', filename: 'one.png', byteSize: 8 }],
    unavailable: [],
    totalBytes: 8,
    downloadUrl: '/api/images/archives/ticket',
    expiresAt: '2026-10-21T10:00:00Z',
  };
  const fetch = vi.fn().mockResolvedValue(Response.json(result));
  vi.stubGlobal('fetch', fetch);
  const input = {
    ids: ['one'],
    query: 'scope=normal',
    version: 'original' as const,
  };
  const signal = new AbortController().signal;
  expect(await requestArchivePreparation(input, signal)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    '/api/images/archives',
    expect.objectContaining({
      method: 'POST',
      signal,
      body: JSON.stringify(input),
    }),
  );
});
it.each([401, 403, 500])(
  'preserves HTTP %s when a response is unreadable for session/error handling',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not JSON', { status })),
    );
    await expect(
      requestArchivePreparation(
        { ids: ['one'], query: '', version: 'original' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status });
  },
);
