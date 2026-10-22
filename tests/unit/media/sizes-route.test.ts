import { beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from '../../../src/app/api/images/[id]/sizes/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import {
  ImageSizeError,
  readImageSize,
  requestImageSize,
} from '../../../src/server/media/sizes.ts';
import { requireSiteSettings } from '../../../src/server/site/settings.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/media/sizes.ts', async (original) => ({
  ...(await original<typeof import('../../../src/server/media/sizes.ts')>()),
  readImageSize: vi.fn(),
  requestImageSize: vi.fn(),
}));
vi.mock('../../../src/server/site/settings.ts', () => ({
  requireSiteSettings: vi.fn(),
}));
const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: logError }),
}));
const select = {
  from: () => ({ where: () => ({ get: () => ({ displayName: '旅行' }) }) }),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: { select: () => select } },
  } as unknown as ReturnType<typeof getServerRuntime>);
  vi.mocked(requireSiteSettings).mockReturnValue({
    publicUrl: 'https://ariso.test',
  } as ReturnType<typeof requireSiteSettings>);
});
const context = { params: Promise.resolve({ id: 'one' }) };
const value = { version: 'compressed' as const, preset: 'medium' as const };
const missing = {
  ...value,
  status: 'missing' as const,
  jobId: null,
  width: 1280,
  height: 853,
  byteSize: null,
  format: 'WEBP',
  error: null,
};
const get = (query = 'version=compressed&preset=medium') =>
  GET(new Request('http://ariso.test/api/images/one/sizes?' + query), context);
const post = (body = JSON.stringify(value)) =>
  POST(
    new Request('http://ariso.test/api/images/one/sizes', {
      method: 'POST',
      body,
    }),
    context,
  );

it.each([
  ['UNAUTHORIZED', 401],
  ['INVALID_ORIGIN', 403],
])(
  'requires %s before reading input or touching runtime',
  async (code, status) => {
    vi.mocked(requireOwner).mockRejectedValue(
      Object.assign(new Error('denied'), { code, status }),
    );
    expect((await get()).status).toBe(status);
    expect((await post('{')).status).toBe(status);
    expect(getServerRuntime).not.toHaveBeenCalled();
  },
);
it('reads missing status without generating and returns 202 only after explicit POST acceptance', async () => {
  vi.mocked(readImageSize).mockReturnValue(missing);
  const read = await get();
  expect(await read.json()).toMatchObject({ status: 'missing', links: null });
  expect(requestImageSize).not.toHaveBeenCalled();
  vi.mocked(requestImageSize).mockReturnValue({
    ...missing,
    status: 'queued',
    jobId: 'task',
  });
  const accepted = await post();
  expect(accepted.status).toBe(202);
  expect(await accepted.json()).toMatchObject({
    status: 'queued',
    links: null,
  });
});
it('returns escaped stable links only for a ready result', async () => {
  vi.mocked(readImageSize).mockReturnValue({
    ...missing,
    status: 'ready',
    byteSize: 88,
  });
  const response = await get();
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toMatchObject({
    status: 'ready',
    links: { url: 'https://ariso.test/i/one?type=compressed&preset=medium' },
  });
});
it('rejects malformed or ambiguous selections before runtime access', async () => {
  for (const response of [
    await get('version=compressed&preset=medium&preset=large'),
    await get('version=original&preset=small'),
    await post('{'),
  ])
    expect(response.status).toBe(400);
  expect(getServerRuntime).not.toHaveBeenCalled();
});
it('keeps lifecycle and persistence failures visible instead of claiming acceptance', async () => {
  vi.mocked(requestImageSize).mockImplementationOnce(() => {
    throw new ImageSizeError('MEDIA_JOB_CONFLICT', 409, '正在处理');
  });
  expect((await post()).status).toBe(409);
  vi.mocked(requestImageSize).mockImplementationOnce(() => {
    throw new Error('database failure');
  });
  expect((await post()).status).toBe(500);
  expect(logError).toHaveBeenCalled();
});
