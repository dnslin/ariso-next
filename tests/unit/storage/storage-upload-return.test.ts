import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { StorageList } from '../../../src/components/storage/storage-list';
import type { StorageSummary } from '../../../src/components/storage/storage-api';

const state = vi.hoisted(() => ({
  storages: [] as StorageSummary[],
  source: '/upload?albumId=a&returnTo=%2Falbums%2Fa%3Fpage%3D2',
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(state.source ? { uploadReturn: state.source } : {}),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isPending: false,
    error: null,
    data:
      queryKey[0] === 'storage-settings'
        ? { defaultStorageId: 'storage-0' }
        : state.storages,
  }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer: ReactNode;
  }) =>
    createElement(
      'main',
      null,
      children,
      createElement('footer', null, footer),
    ),
}));
const shell = {
  name: 'Ariso',
  description: '',
  email: 'owner@example.test',
  ownerName: 'Owner',
  initialSidebarCollapsed: false,
};
function render() {
  const html = renderToStaticMarkup(createElement(StorageList, shell));
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(
    (match) => new URL(match[1].replaceAll('&amp;', '&'), 'http://ariso.test'),
  );
  return { html, links };
}
beforeEach(() => {
  state.source = '/upload?albumId=a&returnTo=%2Falbums%2Fa%3Fpage%3D2';
  state.storages = [];
});

it.each([0, 1, 2, 3])(
  'preserves the exact album upload source in the real unavailable-list branch with %i storages',
  (count) => {
    state.storages = Array.from(
      { length: count },
      (_, index) =>
        ({
          id: `storage-${index}`,
          name: `存储 ${index}`,
          type: 'local',
          enabled: false,
        }) as StorageSummary,
    );
    const { html, links } = render();
    expect(html).toContain(count ? '所有存储均已停用' : '还没有存储');
    expect(html).toContain('返回上传');
    const back = links.find((url) => url.pathname === '/upload')!;
    expect(back.pathname + back.search).toBe(state.source);
    const destinations = links.filter((url) =>
      url.pathname.startsWith('/settings/storage/'),
    );
    expect(destinations.length).toBe(count === 0 ? 2 : count <= 2 ? count : 1);
    for (const destination of destinations)
      expect(destination.searchParams.get('uploadReturn')).toBe(state.source);
    if (count === 0)
      expect(destinations.map((url) => url.searchParams.get('type'))).toEqual([
        'local',
        's3',
      ]);
    else if (count <= 2)
      expect(destinations.map((url) => url.pathname)).toEqual(
        state.storages.map((storage) => `/settings/storage/${storage.id}`),
      );
    else expect(destinations[0].pathname).toBe('/settings/storage/new');
  },
);

it('keeps the original storage routes when no upload recovery is active', () => {
  state.source = '';
  const { html, links } = render();
  expect(html).not.toContain('返回上传');
  expect(links.map((url) => url.pathname + url.search)).toEqual([
    '/settings/storage/new?type=local',
    '/settings/storage/new?type=s3',
  ]);
});

it('does not expose an external upload return supplied in the URL', () => {
  state.source = 'https://outside.test/upload';
  const { html, links } = render();
  expect(html).not.toContain('返回上传');
  expect(links.every((url) => !url.searchParams.has('uploadReturn'))).toBe(
    true,
  );
});
