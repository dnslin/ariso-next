import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { readFilterOptions } from '../../../src/app/library/library-filter-options';

afterEach(() => vi.unstubAllGlobals());

it('clears cached private filter choices and invokes the owning screen session expiry on 401', async () => {
  const client = new QueryClient();
  client.setQueryData(['library-filter-options', 'tags'], {
    items: [{ id: 'private-tag', name: '私人标签' }],
  });
  client.setQueryData(['library-filter-options', 'albums'], {
    items: [{ id: 'private-album', name: '私人相册' }],
  });
  const onSessionExpired = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '登录已失效' }, { status: 401 }),
      ),
  );
  await expect(
    readFilterOptions(
      new URLSearchParams({ kind: 'tags' }),
      new AbortController().signal,
      client,
      onSessionExpired,
    ),
  ).rejects.toThrow('登录已失效（HTTP 401）');
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(onSessionExpired).toHaveBeenCalledTimes(1);
});

it('keeps recoverable errors distinct from session expiry', async () => {
  const client = new QueryClient();
  client.setQueryData(['library-filter-options', 'tags'], { items: [] });
  const onSessionExpired = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '图库读取失败，请重试' }, { status: 500 }),
      ),
  );
  await expect(
    readFilterOptions(
      new URLSearchParams({ kind: 'tags' }),
      new AbortController().signal,
      client,
      onSessionExpired,
    ),
  ).rejects.toThrow('图库读取失败，请重试（HTTP 500）');
  expect(client.getQueryCache().getAll()).toHaveLength(1);
  expect(onSessionExpired).not.toHaveBeenCalled();
  client.clear();
});
