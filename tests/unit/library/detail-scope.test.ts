import { afterEach, expect, it, vi } from 'vitest';
import { readDetail } from '../../../src/components/library/read-detail';

afterEach(() => vi.unstubAllGlobals());
it('rejects an image outside the fixed album instead of opening unrelated content', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        id: 'photo',
        albums: [{ id: 'other', name: '其他相册' }],
      }),
    ),
  );
  await expect(
    readDetail('photo', new AbortController().signal, 'fixed'),
  ).rejects.toMatchObject({
    status: 404,
    message: expect.stringContaining('不在当前相册'),
  });
});
it('allows a direct album detail link only while membership still exists', async () => {
  const data = { id: 'photo', albums: [{ id: 'fixed', name: '目标相册' }] };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
  await expect(
    readDetail('photo', new AbortController().signal, 'fixed'),
  ).resolves.toEqual(data);
});
