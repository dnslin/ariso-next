import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { TagsScreen } from '../../../src/app/tags/screen';
import { TagsList } from '../../../src/app/tags/list';
import { SharesScreen } from '../../../src/app/shares/list-screen';
import { SharesList, type SharePage } from '../../../src/app/shares/list';
import { SettingsScreen } from '../../../src/app/shares/settings';
import type { Tag } from '../../../src/app/tags/api';

const runtime = vi.hoisted(() => ({
  pending: false,
  fetching: false,
  error: null as Error | null,
}));
const navigationCache = new QueryClient();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => navigationCache,
  useQuery: () => ({
    data: runtime.pending ? undefined : { items: [], total: 0 },
    error: runtime.error,
    isError: !!runtime.error,
    isPending: runtime.pending,
    isFetching: runtime.fetching,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    createElement(
      'main',
      null,
      children,
      createElement('footer', null, footer),
    ),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
const shell = {
  name: 'Ariso',
  description: '',
  ownerName: 'Owner',
  email: 'owner@example.test',
  initialSidebarCollapsed: false,
  timeZone: 'UTC',
};
const tag: Tag = {
  id: 'tag',
  displayName: '真实标签',
  imageCount: 4,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
};
const share: SharePage['items'][number] = {
  id: 'share',
  albumId: 'album',
  albumName: '真实相册',
  token: 'token',
  url: 'https://example.test/s/token',
  enabled: true,
  layout: 'grid',
  showName: false,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  publicImageCount: 3,
  hasPassword: true,
  expiresAt: null,
  state: 'enabled',
  cover: {
    imageId: null,
    displayName: null,
    thumbnailUrl: null,
    status: 'empty',
  },
};
beforeEach(() => {
  runtime.pending = false;
  runtime.fetching = false;
  runtime.error = null;
});

it.each([
  { Screen: TagsScreen, name: 'tags' },
  { Screen: SharesScreen, name: 'shares' },
])(
  '$name keeps the title, search and real empty state in separate entrances and the footer still',
  ({ Screen }) => {
    const html = renderToStaticMarkup(createElement(Screen, shell));
    expect(html).toMatch(/<header[^>]*data-component-entry/);
    expect(html).toMatch(
      /data-testid="(?:tags|shares)-empty"[^>]*data-component-entry/,
    );
    expect(html).toMatch(/<h1\b/);
    expect(html.match(/<footer>([\s\S]*)<\/footer>/)?.[1]).not.toContain(
      'data-component-entry',
    );
    expect(html).not.toContain('skeleton');
  },
);

it.each([
  { Screen: TagsScreen, label: '正在读取标签…' },
  { Screen: SharesScreen, label: '正在读取分享…' },
])(
  'first read keeps $label without a spinner or false empty state',
  ({ Screen, label }) => {
    runtime.pending = true;
    runtime.fetching = true;
    const html = renderToStaticMarkup(createElement(Screen, shell));
    expect(html).toContain('role="status"');
    expect(html).toContain(label);
    expect(html).not.toContain('data-slot="spinner"');
    expect(html).not.toContain('data-testid="tags-empty"');
    expect(html).not.toContain('data-testid="shares-empty"');
  },
);

it('share settings retains a readable first-read message without a rotating indicator', () => {
  runtime.pending = true;
  const html = renderToStaticMarkup(
    createElement(SettingsScreen, {
      ...shell,
      albumId: 'album',
      returnHref: '/shares',
    }),
  );
  expect(html).toContain('分享设置');
  expect(html).toContain('正在读取分享设置…');
  expect(html).not.toContain('data-slot="spinner"');
});

it.each([false, true])(
  'tag and share table entrances preserve table/mobile-list semantics while busy=%s',
  (disabled) => {
    const tags = renderToStaticMarkup(
      createElement(TagsList, {
        items: [tag],
        total: 1,
        timeZone: 'UTC',
        disabled,
        onAction: vi.fn(),
      }),
    );
    const shares = renderToStaticMarkup(
      createElement(SharesList, {
        items: [share],
        total: 1,
        timeZone: 'UTC',
        disabled,
      }),
    );
    for (const html of [tags, shares]) {
      expect(html).toMatch(new RegExp(`aria-busy="${disabled}"`));
      expect(html).toMatch(/<tbody[^>]*><tr/);
      expect(html).not.toMatch(/<tbody[^>]*><div/);
      expect(html).toMatch(/<ul[^>]*><li/);
      expect(html).not.toMatch(/<ul[^>]*><div/);
    }
    const actions = shares.match(
      /<(?:a|span)\b[^>]*aria-label="分享设置 [^"]*"[^>]*>/g,
    )!;
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action.includes('aria-disabled="true"')).toBe(disabled);
    }
  },
);

it.each([
  { Screen: TagsScreen, name: 'tags' },
  { Screen: SharesScreen, name: 'shares' },
])('$name keeps failed reads distinct from empty results', ({ Screen }) => {
  runtime.error = new Error('真实读取错误');
  const html = renderToStaticMarkup(createElement(Screen, shell));
  expect(html).toContain('真实读取错误');
  expect(html).not.toContain('data-testid="tags-empty"');
  expect(html).not.toContain('data-testid="shares-empty"');
});
