import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../../src/server/library/types';
import type { BatchItemResult } from '../../../src/server/library/batch-types';

const { readLibraryResult } = vi.hoisted(() => ({
  readLibraryResult: vi.fn(),
}));
vi.mock('../../../src/app/library/use-library-query', () => ({
  readLibraryResult,
}));
import {
  addAlbumImages,
  readAlbumImageChoices,
} from '../../../src/app/albums/image-picker-request';

const page = {
  items: [{ id: 'existing' }, { id: 'new' }] as LibraryItem[],
  total: 42,
  page: 2,
  hasMore: false,
  nextCursor: null,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('album image picker reads', () => {
  it('checks membership for the exact displayed page instead of loading the whole album', async () => {
    readLibraryResult.mockResolvedValue(page);
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [{ id: 'existing' }] }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const result = await readAlbumImageChoices('album/id', '林间', 2, signal);
    expect(readLibraryResult).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'normal', q: '林间', pageSize: 40 }),
      { page: 2 },
      signal,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/images/selection');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ids: ['existing', 'new'],
      query: 'scope=album&albumId=album%2Fid',
    });
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
    expect(result.memberIds).toEqual(['existing']);
    expect(result.total).toBe(42);
  });
  it('does not treat a failed membership read as an empty membership set', async () => {
    readLibraryResult.mockResolvedValue(page);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: '数据库读取失败' }, { status: 500 }),
        ),
    );
    await expect(
      readAlbumImageChoices('album', '', 1, new AbortController().signal),
    ).rejects.toMatchObject({ status: 500, message: '数据库读取失败' });
  });
  it('skips only the unnecessary membership request when the actual page is empty', async () => {
    readLibraryResult.mockResolvedValue({ ...page, items: [], total: 0 });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      (
        await readAlbumImageChoices(
          'album',
          '',
          1,
          new AbortController().signal,
        )
      ).memberIds,
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('album image picker writes', () => {
  const response = (
    ids: string[],
    status: BatchItemResult['status'] = 'changed',
  ) =>
    Response.json({
      results: ids.map((id) => ({
        id,
        status,
        message: status,
        inQuery: true,
      })),
    });
  it('uses explicit normal-library IDs and the current album independently of searches', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response(['from-search-one', 'from-search-two']));
    vi.stubGlobal('fetch', fetch);
    const results: BatchItemResult[] = [];
    const outcome = await addAlbumImages(
      'current',
      ['from-search-one', 'from-search-two'],
      'apply',
      new AbortController().signal,
      (items) => results.push(...items),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ids: ['from-search-one', 'from-search-two'],
      query: 'scope=normal',
      command: { type: 'add-albums', albumIds: ['current'] },
      mode: 'apply',
    });
    expect(results.map((item) => item.id)).toEqual([
      'from-search-one',
      'from-search-two',
    ]);
    expect(outcome.unknownIds).toEqual([]);
  });
  it('checks a lost response without submitting the operation twice', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce(response(['new'], 'unchanged'));
    vi.stubGlobal('fetch', fetch);
    const results: BatchItemResult[] = [];
    const outcome = await addAlbumImages(
      'album',
      ['new'],
      'apply',
      new AbortController().signal,
      (items) => results.push(...items),
    );
    expect(
      fetch.mock.calls.map((call) => JSON.parse(call[1].body).mode),
    ).toEqual(['apply', 'check']);
    expect(results).toMatchObject([{ id: 'new', status: 'unchanged' }]);
    expect(outcome).toEqual({ unknownIds: [], unsentIds: [], message: '' });
  });
  it('retains unknown and unsent IDs when neither response nor read-back can be confirmed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const ids = Array.from({ length: 201 }, (_, index) => `image-${index}`);
    const outcome = await addAlbumImages(
      'album',
      ids,
      'apply',
      new AbortController().signal,
      () => {},
    );
    expect(outcome.unknownIds).toEqual(ids.slice(0, 200));
    expect(outcome.unsentIds).toEqual(ids.slice(200));
  });
  it('preserves per-image failures rather than reporting partial success as complete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          results: [
            { id: 'ok', status: 'changed', inQuery: true, message: '已添加' },
            {
              id: 'failed',
              status: 'failed',
              inQuery: true,
              message: '相册已删除',
            },
          ],
        }),
      ),
    );
    const results: BatchItemResult[] = [];
    await addAlbumImages(
      'album',
      ['ok', 'failed'],
      'apply',
      new AbortController().signal,
      (items) => results.push(...items),
    );
    expect(results).toMatchObject([
      { id: 'ok', status: 'changed' },
      { id: 'failed', status: 'failed', message: '相册已删除' },
    ]);
  });
  it('propagates session expiry instead of rechecking or silently changing the target', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '登录已失效' }, { status: 401 }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      addAlbumImages(
        'album',
        ['new'],
        'apply',
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
