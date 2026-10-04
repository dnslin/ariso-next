import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '../../../src/app/api/media/watermark-assets/[id]/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { readWatermarkAsset } from '../../../src/server/media/watermark-assets.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';

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
vi.mock('../../../src/server/media/watermark-assets.ts', () => ({
  readWatermarkAsset: vi.fn(),
}));

const assetId = '65e40a25-86c5-4cf3-baa1-2d77c8a244ab';
const request = () =>
  new Request(`http://localhost/api/media/watermark-assets/${assetId}`);
const context = () => ({ params: Promise.resolve({ id: assetId }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: {} },
  } as ReturnType<typeof getServerRuntime>);
});

it('requires the owner before reading the asset or route parameters', async () => {
  vi.mocked(requireOwner).mockRejectedValue(
    Object.assign(new Error('请先登录'), {
      code: 'UNAUTHORIZED',
      status: 401,
    }),
  );
  let parametersRead = false;
  const response = await GET(request(), {
    get params() {
      parametersRead = true;
      return Promise.resolve({ id: assetId });
    },
  });
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({
    code: 'UNAUTHORIZED',
    message: '请先登录',
  });
  expect(parametersRead).toBe(false);
  expect(getServerRuntime).not.toHaveBeenCalled();
  expect(readWatermarkAsset).not.toHaveBeenCalled();
  expect(logError).not.toHaveBeenCalled();
});

it('returns only persisted asset attributes and availability without caching', async () => {
  const now = new Date('2026-10-05T00:00:00Z');
  const asset = {
    id: assetId,
    path: `${assetId}/source`,
    format: 'PNG' as const,
    mime: 'image/png',
    width: 320,
    height: 120,
    byteSize: 18640,
    status: 'ready' as const,
    expiresAt: new Date(now.getTime() + 3_600_000),
    error: null,
    createdAt: now,
    updatedAt: now,
    available: true,
  };
  vi.mocked(readWatermarkAsset).mockReturnValue(asset);
  const input = request();
  const response = await GET(input, context());
  expect(requireOwner).toHaveBeenCalledWith(input);
  expect(readWatermarkAsset).toHaveBeenCalledWith({}, assetId);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toEqual({
    ...asset,
    expiresAt: asset.expiresAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  expect(logError).not.toHaveBeenCalled();
});

it('returns an explicit not-found response without concealing it as an empty asset', async () => {
  vi.mocked(readWatermarkAsset).mockImplementation(() => {
    throw Object.assign(new Error(`水印素材不存在: ${assetId}`), {
      code: 'MEDIA_WATERMARK_NOT_FOUND',
      status: 404,
    });
  });
  const response = await GET(request(), context());
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    code: 'MEDIA_WATERMARK_NOT_FOUND',
    message: `水印素材不存在: ${assetId}`,
  });
  expect(logError).not.toHaveBeenCalled();
});

it('records a persistence failure and returns a failed read instead of fabricated attributes', async () => {
  const error = new Error('injected SQLite read failure');
  vi.mocked(readWatermarkAsset).mockImplementation(() => {
    throw error;
  });
  const response = await GET(request(), context());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    code: 'MEDIA_WATERMARK_READ_FAILED',
    message: '水印素材信息读取失败，请检查服务日志',
  });
  expect(logError).toHaveBeenCalledWith(
    { err: error, assetId },
    'Watermark asset read failed',
  );
});
