import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/images/archives/route.ts';
import { GET } from '../../../src/app/api/images/archives/[id]/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { LibraryQueryError } from '../../../src/server/library/query-schema.ts';

const { prepare, download, logError } = vi.hoisted(() => ({
  prepare: vi.fn(),
  download: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: logError }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    archive: { prepare, download },
  } as unknown as ReturnType<typeof getServerRuntime>);
});
const valid = { ids: ['one'], query: '', version: 'original' };
const post = (body = JSON.stringify(valid)) =>
  POST(
    new Request('http://ariso.test/api/images/archives', {
      method: 'POST',
      body,
    }),
  );
const get = () =>
  GET(new Request('http://ariso.test/api/images/archives/id'), {
    params: Promise.resolve({ id: 'id' }),
  });

it.each([
  ['UNAUTHORIZED', 401],
  ['INVALID_ORIGIN', 403],
])(
  'rejects %s before input, ticket or runtime access',
  async (code, status) => {
    vi.mocked(requireOwner).mockRejectedValue(
      Object.assign(new Error('denied'), { code, status }),
    );
    for (const response of [await post('{'), await get()])
      expect(response.status).toBe(status);
    expect(getServerRuntime).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  },
);

it.each([
  '{',
  JSON.stringify({ ...valid, ids: [] }),
  JSON.stringify({ ...valid, version: 'default' }),
])('rejects malformed preparation before runtime access: %s', async (body) => {
  const response = await post(body);
  expect(response.status).toBe(400);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(getServerRuntime).not.toHaveBeenCalled();
});

it('returns only a download URL on success and reports unavailable sources as an HTTP conflict', async () => {
  const result = { downloadUrl: '/api/images/archives/ticket' };
  prepare.mockResolvedValueOnce(result);
  const response = await post();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(prepare).toHaveBeenCalledWith(valid, expect.any(AbortSignal));

  prepare.mockRejectedValueOnce(
    new LibraryQueryError('请求的图片版本不可用', 'ARCHIVE_UNAVAILABLE', 409),
  );
  const unavailable = await post();
  expect(unavailable.status).toBe(409);
  expect(await unavailable.json()).toEqual({
    code: 'ARCHIVE_UNAVAILABLE',
    message: '请求的图片版本不可用',
  });
});

it('keeps the authenticated native ZIP response and supplies an owner recheck to its stream', async () => {
  download.mockImplementation(async (_id, _request, readOwner) => {
    await readOwner();
    return new Response('zip bytes', {
      headers: { 'Content-Type': 'application/zip' },
    });
  });
  const response = await get();
  expect(await response.text()).toBe('zip bytes');
  expect(response.headers.get('content-type')).toBe('application/zip');
  expect(requireOwner).toHaveBeenCalledTimes(2);
});

it('returns expiry and source failure as errors and logs unexpected failures without claiming a download', async () => {
  download.mockRejectedValueOnce(
    new LibraryQueryError('清单已失效', 'ARCHIVE_EXPIRED', 410),
  );
  expect((await get()).status).toBe(410);
  const error = new Error('injected failure');
  prepare.mockRejectedValue(error);
  const response = await post();
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ code: 'ARCHIVE_FAILED' });
  expect(logError).toHaveBeenCalledWith(
    expect.objectContaining({ err: error }),
    'Archive request failed',
  );
});
