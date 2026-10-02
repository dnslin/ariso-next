import { afterEach, expect, it, vi } from 'vitest';
import { requestDetailReprocess } from '../../../src/components/library/request-reprocess';

afterEach(() => vi.unstubAllGlobals());

it('uses the accepted job snapshot, including the real selected derived versions', async () => {
  const receipt = {
    jobId: 'accepted',
    status: 'queued',
    scope: 'all',
    expectedVersions: ['thumbnail'],
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json(receipt));
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await requestDetailReprocess('id/one', 'all', signal)).toEqual(
    receipt,
  );
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    '/api/images/id%2Fone/reprocess',
    expect.objectContaining({
      method: 'POST',
      body: '{"scope":"all"}',
      signal,
    }),
  );
});

it('keeps server errors and session expiry available to the caller', async () => {
  for (const status of [400, 401, 409]) {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: '任务不可受理' }, { status }),
        ),
    );
    await expect(
      requestDetailReprocess(
        'image',
        'watermark',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      status,
      message: `任务不可受理（HTTP ${status}）`,
    });
  }
});

it('does not retry a submission when its response cannot be observed', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValue(new TypeError('connection interrupted'));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    requestDetailReprocess('image', 'compressed', new AbortController().signal),
  ).rejects.toThrow('connection interrupted');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
