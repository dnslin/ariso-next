import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from '../../../src/app/api/settings/upload/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { UploadError } from '../../../src/server/upload/errors.ts';
import {
  patchUploadSettings,
  requireUploadSettings,
} from '../../../src/server/upload/settings.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/upload/settings.ts', () => ({
  patchUploadSettings: vi.fn(),
  requireUploadSettings: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));
const settings = {
  maxFileMiB: 50,
  maxFileBytes: 52428800,
  batchSize: 20,
  queueLimit: 500,
};
const request = (method = 'GET', body?: string) =>
  new Request('http://localhost/api/settings/upload', { method, body });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: {} },
  } as ReturnType<typeof getServerRuntime>);
  vi.mocked(requireUploadSettings).mockReturnValue(settings);
  vi.mocked(patchUploadSettings).mockReturnValue(settings);
});

describe('/api/settings/upload', () => {
  it.each([GET, PATCH])(
    'requires the owner before accessing or updating settings',
    async (route) => {
      vi.mocked(requireOwner).mockRejectedValue(
        Object.assign(new Error('请先登录'), {
          code: 'UNAUTHORIZED',
          status: 401,
        }),
      );
      const response = await route(
        request(
          route === GET ? 'GET' : 'PATCH',
          route === PATCH ? '{}' : undefined,
        ),
      );
      expect(response.status).toBe(401);
      expect(getServerRuntime).not.toHaveBeenCalled();
      expect(requireUploadSettings).not.toHaveBeenCalled();
      expect(patchUploadSettings).not.toHaveBeenCalled();
    },
  );

  it('returns current limits without caching', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(settings);
  });

  it('writes the provided partial settings after owner authorization', async () => {
    const response = await PATCH(request('PATCH', '{"batchSize":10}'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(patchUploadSettings).toHaveBeenCalledWith({}, { batchSize: 10 });
    expect(await response.json()).toEqual(settings);
  });

  it('preserves origin rejection without writing', async () => {
    vi.mocked(requireOwner).mockRejectedValue(
      Object.assign(new Error('请求来源与当前站点地址不符'), {
        code: 'INVALID_ORIGIN',
        status: 403,
      }),
    );
    const response = await PATCH(request('PATCH', '{}'));
    expect(response.status).toBe(403);
    expect(patchUploadSettings).not.toHaveBeenCalled();
  });

  it('returns input errors and uninitialized settings with their explicit status', async () => {
    vi.mocked(patchUploadSettings).mockImplementation(() => {
      throw new UploadError(
        'UPLOAD_SETTINGS_INVALID',
        '批次大小不能超过队列上限',
        422,
      );
    });
    const invalid = await PATCH(
      request('PATCH', '{"batchSize":101,"queueLimit":100}'),
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      code: 'UPLOAD_SETTINGS_INVALID',
    });
    vi.mocked(requireUploadSettings).mockImplementation(() => {
      throw new UploadError(
        'UPLOAD_NOT_INITIALIZED',
        '上传设置尚未初始化',
        409,
      );
    });
    expect((await GET(request())).status).toBe(409);
  });

  it('rejects malformed JSON before updating settings', async () => {
    expect((await PATCH(request('PATCH', '{'))).status).toBe(400);
    expect(patchUploadSettings).not.toHaveBeenCalled();
  });
});
