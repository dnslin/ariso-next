import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { AccountPage } from '../../../src/components/identity/account-page';
import { TokensPage } from '../../../src/components/identity/tokens-page';
import { UploadUsagePage } from '../../../src/components/upload-usage/usage-page';
import { AccountRequestError } from '../../../src/components/identity/account-request';
import { TokenRequestError } from '../../../src/components/identity/token-request';
import { SiteRequestError } from '../../../src/components/site/api';

const state = vi.hoisted(() => ({
  fetched: true,
  fetching: false,
  error: null as Error | null,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    isFetchedAfterMount: state.fetched,
    isFetching: state.fetching,
    isError: !!state.error,
    error: state.error,
    data:
      queryKey[0] === 'account-email'
        ? 'current@example.test'
        : queryKey[0] === 'upload-tokens'
          ? [
              {
                id: 'automation-token',
                name: '每天上传',
                enabled: true,
                createdAt: '2026-10-13T00:00:00.000Z',
                expiresAt: null,
              },
            ]
          : queryKey[0] === 'site-settings'
            ? { publicUrl: 'https://images.example.test' }
            : { maxFileMiB: 80 },
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    removeQueries: vi.fn(),
  }),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({ children }: { children: ReactNode }) =>
    createElement('main', null, children),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/account',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../../src/components/identity/use-github-account', () => ({
  useGithubAccount: () => ({
    settings: {
      isFetchedAfterMount: true,
      isFetching: false,
      isError: false,
      data: {
        saved: { enabled: false, clientId: '', hasSecret: false },
        effective: { enabled: false, clientId: '', hasSecret: false },
        pendingRestart: false,
      },
    },
    binding: {
      isFetchedAfterMount: true,
      isFetching: false,
      isError: false,
      data: null,
    },
    sessionLost: false,
    linking: false,
    linkError: '',
  }),
}));
const shell = {
  name: 'Ariso',
  description: '',
  email: 'shell@example.test',
  ownerName: 'Owner',
};
const pages = [
  {
    name: 'account',
    render: () => renderToStaticMarkup(createElement(AccountPage, shell)),
    loading: '正在读取账号',
    content: 'data-testid="account-email"',
    unauthorized: () => new AccountRequestError(401, { message: '会话失效' }),
  },
  {
    name: 'tokens',
    render: () =>
      renderToStaticMarkup(
        createElement(TokensPage, { ...shell, timeZone: 'UTC' }),
      ),
    loading: '正在读取 Token',
    content: 'data-testid="api-token"',
    unauthorized: () => new TokenRequestError(401, { message: '会话失效' }),
  },
  {
    name: 'usage',
    render: () => renderToStaticMarkup(createElement(UploadUsagePage, shell)),
    loading: '正在读取站点地址和上传限制',
    content: 'data-testid="upload-usage-command"',
    unauthorized: () => new SiteRequestError(401, { message: '会话失效' }),
  },
];
beforeEach(() => {
  state.fetched = true;
  state.fetching = false;
  state.error = null;
});

it.each(pages)('$name 首次读取仍等待本次 GET，缓存不能提前露出内容', (page) => {
  state.fetched = false;
  state.fetching = true;
  const html = page.render();
  expect(html).toContain(page.loading);
  expect(html).not.toContain(page.content);
  expect(html).not.toContain('data-slot="spinner"');
});

it.each(pages)('$name 后台重新读取时保留已呈现内容', (page) => {
  expect(page.render()).toContain(page.content);
  state.fetching = true;
  const html = page.render();
  expect(html).toContain(page.content);
  expect(html).not.toContain(page.loading);
  if (page.name === 'account') {
    expect(html).toContain('current@example.test');
    expect(html).toMatch(
      /<button[^>]*data-testid="account-change-email"[^>]*disabled/,
    );
  }
  if (page.name === 'tokens') {
    expect(html).toContain('每天上传');
    expect(html).toMatch(
      /<button[^>]*data-testid="api-create-open"[^>]*disabled/,
    );
    expect(html).toMatch(/<button[^>]*data-testid="api-toggle"[^>]*disabled/);
  }
  if (page.name === 'usage') {
    expect(html).toContain('https://images.example.test');
    expect(html).toContain('80 MiB');
  }
});

it.each(pages)('$name 读取返回 401 时立即隐藏已有内容', (page) => {
  expect(page.render()).toContain(page.content);
  state.error = page.unauthorized();
  const html = page.render();
  expect(html).toContain('会话已失效');
  expect(html).toContain('重新登录');
  expect(html).not.toContain(page.content);
});
