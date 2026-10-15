import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AlbumRequestError, type Album } from '../../../src/app/albums/api';
import type { TagPage } from '../../../src/app/tags/api';
import {
  BatchTargets,
  useBatchTargets,
} from '../../../src/components/library/batch-targets';
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
          visibility: 'private',
          hasAlbums: true,
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
      albumTargets: [],
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

it('does not inject a cached current album into explicit library removal targets', () => {
  const cache = client();
  cache.setQueryData(['batch-current-album', album.id], { album });
  const html = render(batch('remove-albums'), cache);
  expect(targetIds(html)).toEqual([]);
  expect(html).not.toContain('之前读取的相册');
});

it('keeps compact tag names and counts readable without exposing target identifiers', () => {
  const html = render(batch('add-tags'), client());
  expect(html).not.toContain('已选 1 张图片 · 1 个标签');
  expect(html).toContain('搜索目标标签');
  expect(html).toContain('选择标签：tag-one');
  expect(html).not.toContain('选择标签：tag-one · tag-one');
  expect(html).not.toContain('tag-one · 1 张图片');
  expect(html).toContain('1 张图片');
  expect(html).toContain('新标签名称');
  expect(html).not.toContain('upload-create-tag');
  expect(html).not.toContain('每张图');
  expect(html).not.toContain('标签操作说明');
});

it('gives unselected target controls an explicit border independently of borderless field tokens', () => {
  const html = render(batch('add-tags'), client());
  const unchecked = html.split('data-target-id="tag-two"')[1];
  const control = unchecked.match(
    /<span[^>]*data-slot="checkbox-control"[^>]*>/,
  )?.[0];
  expect(control).toBeDefined();
  expect(control).toContain('size-4');
  expect(control).toMatch(/\sborder\s/);
  expect(control).toContain('border-border');
  expect(control).toContain('bg-background');
});

it('keeps names of earlier-page album selections while adding a same-name target', () => {
  const cache = client();
  const state = batch('remove-albums');
  state.workspace!.albumTargets = [{ id: album.id, name: '选择时的名称' }];
  cache.setQueryData(['batch-targets', true, '', 1], {
    items: [
      { ...album, name: '后来改名' },
      { ...album, id: 'second-album', name: '选择时的名称' },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
  });
  let targets!: ReturnType<typeof useBatchTargets>;
  function Probe() {
    targets = useBatchTargets({ batch: state, client: cache });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  targets.choose([album.id, 'second-album']);
  expect(state.choose).toHaveBeenCalledWith(
    { type: 'remove-albums', albumIds: [album.id, 'second-album'] },
    [
      { id: album.id, name: '选择时的名称' },
      { id: 'second-album', name: '选择时的名称' },
    ],
  );
  targets.choose(['second-album']);
  expect(state.choose).toHaveBeenLastCalledWith(
    { type: 'remove-albums', albumIds: ['second-album'] },
    [{ id: 'second-album', name: '选择时的名称' }],
  );
});
