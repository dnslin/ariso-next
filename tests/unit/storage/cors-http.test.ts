import { beforeEach, expect, it, vi } from 'vitest';
const startCors = vi.hoisted(() => vi.fn());
const finishCors = vi.hoisted(() => vi.fn());
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => ({
    connection: { db: {} },
    config: { dataDir: '/tmp/cors-http', encryptionKey: Buffer.alloc(32, 37) },
    storageProbes: { startCors, finishCors },
  }),
}));
import { POST as start } from '../../../src/app/api/storages/[id]/cors-tests/route.ts';
import { POST as finish } from '../../../src/app/api/storages/[id]/cors-tests/[probeId]/complete/route.ts';
const origin = 'https://ariso.example.com';
function request(body: unknown) {
  return new Request(`${origin}/api/storages/id/cors-tests`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  startCors.mockResolvedValue({ probeId: 'probe' });
  finishCors.mockResolvedValue({ passed: false });
});
it('创建只接受 revision，来源取自真实 HTTP header，签名响应禁止缓存', async () => {
  const response = await start(request({ revision: 1 }), {
    params: Promise.resolve({ id: 'storage' }),
  });
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(startCors).toHaveBeenCalledWith('storage', 1, origin);
  expect(
    (
      await start(
        request({ revision: 1, origin: 'https://forged.example.com' }),
        { params: Promise.resolve({ id: 'storage' }) },
      )
    ).status,
  ).toBe(400);
  expect(startCors).toHaveBeenCalledTimes(1);
});
it.each([
  { passed: true },
  {
    results: [
      { method: 'PUT', status: 200, responseType: 'cors', passed: true },
    ],
  },
  {
    results: [
      { method: 'PUT', status: 200, responseType: 'cors' },
      { method: 'PUT', status: 200, responseType: 'cors' },
    ],
  },
  { results: [{ method: 'DELETE', status: 200, responseType: 'cors' }] },
  { results: [{ method: 'PUT', status: -1, responseType: 'cors' }] },
])('完成入口拒绝任意通过标记或非法方法/状态 %#', async (body) => {
  const response = await finish(request(body), {
    params: Promise.resolve({ id: 'storage', probeId: 'probe' }),
  });
  expect(response.status).toBe(400);
  expect(finishCors).not.toHaveBeenCalled();
});
it('失败也交给服务器确认与清理，200 本身不表示测试通过', async () => {
  const results = [
    {
      method: 'PUT',
      status: 0,
      responseType: 'error',
      error: 'Failed to fetch',
    },
  ];
  const response = await finish(request({ results }), {
    params: Promise.resolve({ id: 'storage', probeId: 'probe' }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ passed: false });
  expect(finishCors).toHaveBeenCalledWith('storage', 'probe', origin, results);
});
