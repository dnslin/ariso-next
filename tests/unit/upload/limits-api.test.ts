import { afterEach, expect, it, vi } from 'vitest';
import {
  uploadLimitsRequest,
  UploadLimitsRequestError,
} from '../../../src/components/upload-limits/api.ts';
import {
  uploadLimitsInput,
  uploadLimitsMatch,
} from '../../../src/components/upload-limits/model.ts';

afterEach(() => vi.unstubAllGlobals());

it('preserves the real saved byte value and sends only upload-owned scalar fields', async () => {
  const saved = {
    maxFileMiB: 51,
    maxFileBytes: 51 * 1048576,
    batchSize: 21,
    queueLimit: 501,
  };
  const fetcher = vi.fn().mockResolvedValue(Response.json(saved));
  vi.stubGlobal('fetch', fetcher);
  const input = uploadLimitsInput(saved);
  expect(input).toEqual({ maxFileMiB: 51, batchSize: 21, queueLimit: 501 });
  expect(
    await uploadLimitsRequest({ method: 'PATCH', body: JSON.stringify(input) }),
  ).toEqual(saved);
  expect(fetcher).toHaveBeenCalledWith('/api/settings/upload', {
    cache: 'no-store',
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  expect(uploadLimitsMatch(input, saved)).toBe(true);
  expect(uploadLimitsMatch({ ...input, queueLimit: 500 }, saved)).toBe(false);
});

it('retains HTTP rejection status and binding fields', async () => {
  const fields = [{ field: 'batchSize', message: '批次大小不能超过队列上限' }];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'UPLOAD_SETTINGS_INVALID',
          message: '请检查上传限制字段',
          fields,
        },
        { status: 422 },
      ),
    ),
  );
  await expect(uploadLimitsRequest()).rejects.toMatchObject({
    status: 422,
    code: 'UPLOAD_SETTINGS_INVALID',
    fields,
  });
});

it.each([401, 403, 409, 503])(
  'retains status %s when a gateway supplies an HTML error',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<h1>Unavailable</h1>', { status })),
    );
    const result = uploadLimitsRequest();
    await expect(result).rejects.toBeInstanceOf(UploadLimitsRequestError);
    await expect(result).rejects.toMatchObject({ status, fields: [] });
  },
);

it('does not turn a network failure or malformed successful response into a saved result', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('response lost')),
  );
  await expect(uploadLimitsRequest()).rejects.toThrow('response lost');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('not JSON', { status: 200 })),
  );
  await expect(uploadLimitsRequest()).rejects.toThrow(SyntaxError);
});
