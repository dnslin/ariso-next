import { expect, it, vi } from 'vitest';
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => ({
    connection: { db: {} },
    config: { dataDir: '/tmp/probe-http', encryptionKey: Buffer.alloc(32, 37) },
  }),
}));
import { storageResponse } from '../../../src/server/storage/http.ts';
it.each([
  ['STORAGE_OPERATION_FAILED', 502],
  ['STORAGE_TIMEOUT', 504],
] as const)('手动清理保留远端错误 %s / %s', async (code, status) => {
  const response = await storageResponse(
    new Request('http://localhost/api/storages/id/probes/probe/retry-cleanup', {
      method: 'POST',
    }),
    () => {
      throw Object.assign(new Error('remote operation failed'), { code });
    },
  );
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    code,
    message: 'remote operation failed',
  });
});

it.each([502, 504, 500])('扫描错误保留真实 HTTP 状态 %s', async (status) => {
  const response = await storageResponse(
    new Request('http://localhost/api/storages/id', { method: 'DELETE' }),
    () => {
      throw Object.assign(new Error('namespace scan failed'), {
        code: 'STORAGE_SCAN_FAILED',
        status,
      });
    },
  );
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await response.json()).code).toBe(
    status === 500 ? 'STORAGE_INTERNAL_ERROR' : 'STORAGE_SCAN_FAILED',
  );
});
