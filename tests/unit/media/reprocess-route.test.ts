import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/images/[id]/reprocess/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import {
  MediaReprocessError,
  requestReprocess,
} from '../../../src/server/media/reprocess.ts';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: logError }),
}));
vi.mock('../../../src/server/media/reprocess.ts', async (original) => ({
  ...(await original<
    typeof import('../../../src/server/media/reprocess.ts')
  >()),
  requestReprocess: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: {} },
  } as ReturnType<typeof getServerRuntime>);
});
async function post(body?: string) {
  const response = await POST(
    new Request('http://localhost/api/images/image/reprocess', {
      method: 'POST',
      body,
    }),
    { params: Promise.resolve({ id: 'image' }) },
  );
  expect(response.headers.get('cache-control')).toBe('no-store');
  return { status: response.status, body: await response.json() };
}
it.each([
  ['UNAUTHORIZED', 401],
  ['INVALID_ORIGIN', 403],
])('requires %s before touching the runtime', async (code, status) => {
  vi.mocked(requireOwner).mockRejectedValue(
    Object.assign(new Error('Owner required'), { code, status }),
  );
  expect(await post()).toEqual({
    status,
    body: { code, message: 'Owner required' },
  });
  expect(getServerRuntime).not.toHaveBeenCalled();
  expect(requestReprocess).not.toHaveBeenCalled();
});
it('returns 202 for an accepted queued task and passes the image and scope', async () => {
  vi.mocked(requestReprocess).mockReturnValue({
    jobId: '00000000-0000-0000-0000-000000000001',
    status: 'queued',
    scope: 'thumbnail',
    expectedVersions: ['thumbnail'],
  });
  expect(await post('{"scope":"thumbnail"}')).toEqual({
    status: 202,
    body: {
      jobId: '00000000-0000-0000-0000-000000000001',
      status: 'queued',
      scope: 'thumbnail',
      expectedVersions: ['thumbnail'],
    },
  });
  expect(requestReprocess).toHaveBeenCalledWith({}, 'image', {
    scope: 'thumbnail',
  });
});
it('passes an empty body as the default scope input and rejects malformed JSON', async () => {
  vi.mocked(requestReprocess).mockReturnValue({
    jobId: '00000000-0000-0000-0000-000000000001',
    status: 'queued',
    scope: 'all',
    expectedVersions: ['compressed', 'thumbnail'],
  });
  expect((await post()).status).toBe(202);
  expect(requestReprocess).toHaveBeenCalledWith({}, 'image', {});
  vi.mocked(requestReprocess).mockClear();
  expect((await post('{')).status).toBe(400);
  expect(requestReprocess).not.toHaveBeenCalled();
});
it.each([404, 409] as const)(
  'preserves explicit lifecycle error %s',
  async (status) => {
    vi.mocked(requestReprocess).mockImplementation(() => {
      throw new MediaReprocessError(
        'MEDIA_IMAGE_UNAVAILABLE',
        status,
        'Unavailable',
      );
    });
    expect(await post('{}')).toEqual({
      status,
      body: { code: 'MEDIA_IMAGE_UNAVAILABLE', message: 'Unavailable' },
    });
    expect(logError).not.toHaveBeenCalled();
  },
);
it('logs unexpected persistence errors and returns 500 without reporting acceptance', async () => {
  const error = new Error('injected database write failure');
  vi.mocked(requestReprocess).mockImplementation(() => {
    throw error;
  });
  expect(await post('{}')).toMatchObject({
    status: 500,
    body: { code: 'INTERNAL_SERVER_ERROR' },
  });
  expect(logError).toHaveBeenCalledWith(
    expect.objectContaining({ err: error, imageId: 'image' }),
    'Reprocessing request failed',
  );
});
