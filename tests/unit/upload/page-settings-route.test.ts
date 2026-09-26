import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../../src/app/upload/settings/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { UploadError } from '../../../src/server/upload/errors.ts';
import { readUploadPageSettings } from '../../../src/server/upload/page-settings.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/upload/page-settings.ts', () => ({
  readUploadPageSettings: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));

beforeEach(() => {
  vi.resetAllMocks();
});
const request = () => new Request('http://localhost/upload/settings');

describe('GET /upload/settings', () => {
  it('requires the owner before accessing the runtime or settings', async () => {
    vi.mocked(requireOwner).mockRejectedValue(
      Object.assign(new Error('请先登录'), {
        code: 'UNAUTHORIZED',
        status: 401,
      }),
    );
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(getServerRuntime).not.toHaveBeenCalled();
    expect(readUploadPageSettings).not.toHaveBeenCalled();
  });

  it('returns the current page settings without caching', async () => {
    vi.mocked(getServerRuntime).mockReturnValue({
      connection: { db: {} },
    } as ReturnType<typeof getServerRuntime>);
    const settings = {
      maxFileBytes: 123,
      queueLimit: 7,
      defaultVisibility: 'private' as const,
      defaultStorageId: null,
      storages: [],
    };
    vi.mocked(readUploadPageSettings).mockReturnValue(settings);
    const response = await GET(request());
    expect(requireOwner).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(settings);
  });

  it('preserves upload initialization errors', async () => {
    vi.mocked(getServerRuntime).mockReturnValue({
      connection: { db: {} },
    } as ReturnType<typeof getServerRuntime>);
    vi.mocked(readUploadPageSettings).mockImplementation(() => {
      throw new UploadError(
        'UPLOAD_NOT_INITIALIZED',
        '上传设置尚未初始化',
        409,
      );
    });
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      code: 'UPLOAD_NOT_INITIALIZED',
      message: '上传设置尚未初始化',
    });
  });
});
