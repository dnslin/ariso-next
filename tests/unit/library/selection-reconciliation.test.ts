import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSelection } from '../../../src/app/library/use-selection-reconciliation';
import { parseLibraryLocation } from '../../../src/app/library/query-state';
import { LibraryReadError } from '../../../src/app/library/use-library-query';

const filters = parseLibraryLocation(
  new URLSearchParams('q=chosen&pageSize=80&page=2'),
).filters;
afterEach(() => vi.unstubAllGlobals());

describe('selection membership reads', () => {
  it('splits 241 explicit IDs into sequential bounded reads of the same query', async () => {
    const requests: { ids: string[]; query: string }[] = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('/api/images/selection');
      expect(init.cache).toBe('no-store');
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return Response.json({ items: body.ids.map((id: string) => ({ id })) });
    });
    vi.stubGlobal('fetch', fetcher);
    const ids = Array.from({ length: 241 }, (_, index) => String(index));
    const result = await readSelection(
      ids,
      filters,
      new AbortController().signal,
    );
    expect(requests.map((request) => request.ids.length)).toEqual([200, 41]);
    expect(requests.flatMap((request) => request.ids)).toEqual(ids);
    expect(requests[0].query).toBe(requests[1].query);
    expect(new URLSearchParams(requests[0].query).has('page')).toBe(false);
    expect(result.map((item) => item.id)).toEqual(ids);
  });

  it('fails the entire read if a later batch fails instead of applying partial membership', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'a' }] }))
      .mockResolvedValueOnce(
        Response.json(
          { code: 'LIBRARY_STALE_REFERENCE', message: '相册已失效' },
          { status: 409 },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      readSelection(
        Array.from({ length: 201 }, (_, index) => String(index)),
        filters,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ message: '相册已失效', status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retains authentication and network errors and stops batches on cancellation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'UNAUTHORIZED', message: '登录已失效' },
            { status: 401 },
          ),
        ),
    );
    await expect(
      readSelection(['a'], filters, new AbortController().signal),
    ).rejects.toBeInstanceOf(LibraryReadError);
    const cause = new TypeError('network');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
    await expect(
      readSelection(['a'], filters, new AbortController().signal),
    ).rejects.toMatchObject({ cause });
    const controller = new AbortController();
    const fetcher = vi.fn(async () => {
      controller.abort();
      return Response.json({ items: [] });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      readSelection(
        Array.from({ length: 201 }, (_, index) => String(index)),
        filters,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
