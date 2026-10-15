import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../../src/app/api/images/[id]/preview/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { prepareTiffPreview } from '../../../src/server/media/tiff-preview.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/media/tiff-preview.ts', () => ({
  prepareTiffPreview: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));
const context = { params: Promise.resolve({ id: 'image-id' }) };
const request = () =>
  new Request('http://localhost/api/images/image-id/preview');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: {} },
    config: {
      dataDir: '/data',
      encryptionKey: Buffer.alloc(32),
      logLevel: 'info',
    },
    mediaResources: {},
    mediaQueue: { previews: {} },
  } as unknown as ReturnType<typeof getServerRuntime>);
});
describe('owner TIFF preview route', () => {
  it('authorizes before reading runtime, image state or original bytes', async () => {
    vi.mocked(requireOwner).mockRejectedValue(
      Object.assign(new Error('请先登录'), {
        code: 'UNAUTHORIZED',
        status: 401,
      }),
    );
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(getServerRuntime).not.toHaveBeenCalled();
    expect(prepareTiffPreview).not.toHaveBeenCalled();
  });
  it('returns the temporary PNG response from the shared preview runtime', async () => {
    const response = new Response('PNG', {
      headers: { 'Content-Type': 'image/png' },
    });
    vi.mocked(prepareTiffPreview).mockResolvedValue(response);
    const input = request();
    expect(await GET(input, context)).toBe(response);
    expect(prepareTiffPreview).toHaveBeenCalledWith(
      input,
      'image-id',
      expect.objectContaining({
        storageRoot: '/data/storage',
        temporaryRoot: '/data/tmp',
      }),
      {},
    );
  });
  it('reports download-required errors with their 413 status and message', async () => {
    vi.mocked(prepareTiffPreview).mockRejectedValue(
      Object.assign(new Error('TIFF 原图超过 50 MiB，请下载后查看。'), {
        code: 'TIFF_PREVIEW_DOWNLOAD_REQUIRED',
        status: 413,
      }),
    );
    const response = await GET(request(), context);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      code: 'TIFF_PREVIEW_DOWNLOAD_REQUIRED',
      message: 'TIFF 原图超过 50 MiB，请下载后查看。',
    });
  });
});
