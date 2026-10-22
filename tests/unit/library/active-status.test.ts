import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  applyActiveLibraryStatus,
  readActiveLibraryStatuses,
} from '../../../src/app/library/active-library-status';
import type {
  LibraryItem,
  LibraryPage,
} from '../../../src/server/library/types';

afterEach(() => vi.unstubAllGlobals());
function item(id: string): LibraryItem {
  return {
    id,
    displayName: id,
    originalName: id + '.png',
    byteSize: 10,
    format: 'PNG',
    width: 10,
    height: 10,
    visibility: 'private',
    hasAlbums: false,
    processingStatus: 'ready',
    createdAt: '2026-10-21T00:00:00Z',
    storage: { id: 's', name: 'Local', enabled: true },
    versions: {
      original: true,
      compressed: true,
      thumbnail: true,
      watermark: false,
    },
    thumbnailUrl: `/i/${id}?type=thumbnail&v=old`,
    thumbnailDimensions: { width: 10, height: 10 },
    activeJob: {
      id: `${id}-replace`,
      kind: 'replace',
      status: 'running',
      scope: 'all',
      step: 'thumbnail',
      error: null,
    },
    latestFailedJob: null,
    metadataJob: null,
    processingJob: null,
    trashedAt: null,
    deletionStatus: null,
  };
}
it('updates only existing cards and asks for canonical membership refresh at the real terminal transition', () => {
  const client = new QueryClient();
  const key = ['library', 'more', 'filters'];
  const a = item('a');
  const b = item('b');
  const c = { ...item('c'), activeJob: null };
  const before: InfiniteData<LibraryPage> = {
    pages: [
      { items: [a, b], total: 3, hasMore: true, nextCursor: 'a-cursor' },
      { items: [c], total: 3, hasMore: false, nextCursor: null },
    ],
    pageParams: [null, 'a-cursor'],
  };
  client.setQueryData(key, before);
  const changed = {
    ...a,
    activeJob: null,
    thumbnailUrl: '/i/a?type=thumbnail&v=new',
  };
  expect(
    applyActiveLibraryStatus(client, key, {
      items: [changed, { ...item('outside'), activeJob: null }],
      missingIds: [],
    }),
  ).toBe(true);
  const after = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(after.pageParams).toEqual([null, 'a-cursor']);
  expect(after.pages.map((page) => page.items.map((row) => row.id))).toEqual([
    ['a', 'b'],
    ['c'],
  ]);
  expect(after.pages[0]).toMatchObject({
    total: 3,
    nextCursor: 'a-cursor',
    items: [
      { id: 'a', thumbnailUrl: '/i/a?type=thumbnail&v=new' },
      { id: 'b', activeJob: { id: 'b-replace' } },
    ],
  });
  expect(before.pages[0].items[0].thumbnailUrl).toContain('v=old');
  expect(
    applyActiveLibraryStatus(client, key, { items: [changed], missingIds: [] }),
  ).toBe(false);
  client.clear();
});
it('preserves offset page position while a task is still running', () => {
  const client = new QueryClient();
  const key = ['library', 'pages', 3];
  const value = item('image');
  client.setQueryData(key, {
    page: 3,
    pageSize: 20,
    items: [value],
    total: 80,
    nextCursor: null,
    hasMore: true,
  });
  expect(
    applyActiveLibraryStatus(client, key, {
      items: [
        { ...value, activeJob: { ...value.activeJob!, step: 'complete' } },
      ],
      missingIds: [],
    }),
  ).toBe(false);
  expect(client.getQueryData(key)).toMatchObject({
    page: 3,
    pageSize: 20,
    total: 80,
    items: [{ activeJob: { step: 'complete' } }],
  });
  client.clear();
});
it('reads active IDs in the existing bounded 80-item batches', async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const ids = JSON.parse(init.body as string).ids as string[];
    return Response.json({ items: ids.map(item), missingIds: [] });
  });
  vi.stubGlobal('fetch', fetcher);
  const ids = Array.from({ length: 181 }, (_, i) => 'image-' + i);
  const result = await readActiveLibraryStatuses(
    ids,
    new AbortController().signal,
  );
  expect(
    fetcher.mock.calls.map(
      (call) => JSON.parse(call[1].body as string).ids.length,
    ),
  ).toEqual([80, 80, 21]);
  expect(result.items.map((row) => row.id)).toEqual(ids);
});
