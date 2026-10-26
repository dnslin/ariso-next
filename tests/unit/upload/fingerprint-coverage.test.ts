import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  requestFingerprintCoverage,
  UploadFingerprintCoverage,
} from '../../../src/components/upload/fingerprint-coverage';
const progress = vi.hoisted(() => ({
  total: 10,
  completed: 4,
  pending: 2,
  running: 1,
  failed: 2,
  unavailable: 1,
  complete: false,
  failures: [
    { imageId: 'old', displayName: 'old.png', message: '原文件读取失败' },
  ],
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: progress,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
it('reads coverage without caching and explicitly retries only with POST', async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json(progress));
  vi.stubGlobal('fetch', fetch);
  expect(await requestFingerprintCoverage()).toEqual(progress);
  await requestFingerprintCoverage(undefined, true);
  expect(
    fetch.mock.calls.map(([url, init]) => [url, init.method, init.cache]),
  ).toEqual([
    ['/api/uploads/fingerprints', 'GET', 'no-store'],
    ['/api/uploads/fingerprints', 'POST', 'no-store'],
  ]);
});
it('surfaces server failures instead of claiming complete coverage', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '存储不可读取' }, { status: 503 }),
      ),
  );
  await expect(requestFingerprintCoverage()).rejects.toThrow(
    '存储不可读取（HTTP 503）',
  );
});
it('shows real counts, failed filenames, partial coverage limits and explicit retry', () => {
  const html = renderToStaticMarkup(
    createElement(UploadFingerprintCoverage, {
      client: new QueryClient(),
      paused: false,
    }),
  );
  expect(html).toContain('已完成 4 / 10 张');
  expect(html).toContain('失败 2 张');
  expect(html).toContain('存储停用 1 张');
  expect(html).toContain('未检查的旧图暂不能保证识别重复');
  expect(html).toContain('old.png');
  expect(html).toContain('原文件读取失败');
  expect(html).toContain('重试失败项');
});
