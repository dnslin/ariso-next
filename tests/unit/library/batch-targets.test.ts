import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AlbumRequestError, type Album } from '../../../src/app/albums/api';
import type { TagPage } from '../../../src/app/tags/api';
import { BatchTargets } from '../../../src/components/library/batch-targets';
import type { LibraryBatch } from '../../../src/components/library/use-library-batch';

const clients = new Set<QueryClient>();
const album: Album = {
  id: 'cached-album',
  name: '之前读取的相册',
  description: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  imageCount: 0,
  publicImageCount: 0,
  cover: {
    imageId: null,
    mode: 'empty',
    preferredCoverImageId: null,
    temporaryFallback: false,
    displayName: null,
    status: 'empty',
    thumbnailUrl: null,
  },
};
const tags: TagPage = {
  items: ['tag-one', 'tag-two'].map((id) => ({
    id,
    displayName: id,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    imageCount: 1,
  })),
  total: 2,
  page: 1,
  pageSize: 20,
};
function batch(
  action: 'add-tags' | 'remove-tags' | 'remove-albums',
): LibraryBatch {
  return {
    workspace: {
      action,
      items: [
        {
          id: 'image',
          displayName: '实际已选图片.png',
          thumbnailUrl: '/i/image?type=thumbnail',
          storage: { id: 'local', name: '本地', enabled: true },
          source: '第1页',
          inCurrentPage: true,
        },
      ],
      currentCount: 1,
      query: 'album=cached-album',
      command:
        action === 'remove-albums'
          ? { type: action, albumIds: [album.id] }
          : { type: action, tagIds: ['tag-one'] },
      results: [],
      unknownIds: [],
      unsentIds: [],
      message: '',
      checkFailed: false,
      retrying: false,
      phase: 'choose',
    },
    returnLabel: '返回相册内容',
    targetReady: false,
    setTargetReady: vi.fn(),
    showFailures: false,
    toggleFailures: vi.fn(),
    visible: true,
    pending: false,
    open: vi.fn(),
    close: vi.fn(),
    unresolved: false,
    reopen: vi.fn(),
    onExpire: vi.fn(),
    choose: vi.fn(),
    submit: vi.fn(),
    check: vi.fn(),
    retry: vi.fn(),
    retryFailures: vi.fn(),
    failedIds: [],
    progressError: '',
    checkProgress: vi.fn(),
    retryTasks: vi.fn(),
    retryFailuresAll: vi.fn(),
  };
}
function client() {
  const result = new QueryClient();
  clients.add(result);
  result.setQueryData(['batch-targets', false, '', 1], tags);
  result.setQueryData(['batch-targets', true, '', 1], {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  return result;
}
const render = (state: LibraryBatch, cache: QueryClient) =>
  renderToStaticMarkup(
    createElement(BatchTargets, {
      batch: state,
      client: cache,
      currentAlbumId: album.id,
    }),
  );
const targetIds = (html: string) =>
  [...html.matchAll(/data-target-id="([^"]+)"/g)].map((match) => match[1]);
afterEach(() => {
  for (const cache of clients) cache.clear();
  clients.clear();
});

it.each(['add-tags', 'remove-tags'] as const)(
  'keeps cached album identities out of real %s target controls',
  (action) => {
    const cache = client();
    cache.setQueryData(['batch-current-album', album.id], { album });
    const html = render(batch(action), cache);
    expect(targetIds(html)).toEqual(['tag-one', 'tag-two']);
    expect(html).not.toContain('之前读取的相册');
  },
);

it.each(['add-tags', 'remove-tags'] as const)(
  'does not show an unrelated cached current-album error in %s target selection',
  async (action) => {
    const cache = client();
    await expect(
      cache.fetchQuery({
        queryKey: ['batch-current-album', album.id],
        queryFn: () =>
          Promise.reject(new AlbumRequestError('之前的相册读取失败', 404)),
        retry: false,
      }),
    ).rejects.toThrow('之前的相册读取失败');
    const html = render(batch(action), cache);
    expect(targetIds(html)).toEqual(['tag-one', 'tag-two']);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('之前的相册读取失败');
  },
);

it('keeps the actual current album selectable for removal even when absent from the target page', () => {
  const cache = client();
  cache.setQueryData(['batch-current-album', album.id], { album });
  const html = render(batch('remove-albums'), cache);
  expect(targetIds(html)).toEqual([album.id]);
  expect(html).toContain('之前读取的相册');
});

it('uses one focusable Button as the tag tips trigger without duplicating its DOM ID', () => {
  const html = render(batch('add-tags'), client());
  const button = html.match(/<button[^>]*aria-label="标签操作说明"[^>]*>/)?.[0];
  expect(button).toBeDefined();
  const id = button?.match(/\bid="([^"]+)"/)?.[1];
  expect(id).toBeDefined();
  expect(html.split(`id="${id}"`)).toHaveLength(2);
  expect(html).not.toMatch(
    /<div[^>]*role="button"[^>]*>\s*<button[^>]*aria-label="标签操作说明"/,
  );
});
