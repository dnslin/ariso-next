import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GeneralPage } from '../../../src/components/site/general-page';
import type { SiteSettingsResponse } from '../../../src/components/site/api';

const runtime = vi.hoisted(() => ({
  rendering: false,
  cursor: 0,
  cells: [] as unknown[],
  success: false,
  enabled: true,
  editor: vi.fn(),
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!runtime.rendering) return actual.useState(initial);
      const index = runtime.cursor++;
      if (!(index in runtime.cells)) runtime.cells[index] = initial;
      return [
        runtime.cells[index],
        (value: unknown) => {
          runtime.cells[index] = value;
        },
      ];
    },
    useCallback: (callback: unknown, deps: unknown[]) =>
      runtime.rendering
        ? callback
        : actual.useCallback(callback as (...args: unknown[]) => unknown, deps),
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled: boolean }) => {
    runtime.enabled = enabled;
    return {
      isFetchedAfterMount: runtime.success,
      isFetching: !runtime.success,
      isSuccess: runtime.success,
      data: saved,
    };
  },
}));
vi.mock('../../../src/components/site/use-site-settings', () => ({
  useSiteSettings: () => {
    runtime.editor();
    return {
      saved,
      input: saved,
      phase: 'ready',
      expired: false,
      locked: false,
      errors: {},
      message: '',
      originNotice: false,
      timeZoneNotice: false,
      expire: vi.fn(),
      change: vi.fn(),
      save: vi.fn(),
    };
  },
}));
vi.mock('../../../src/components/site/site-navigation', () => ({
  useSiteNavigation: () => ({ navigate: vi.fn() }),
  SiteLeaveDialog: () => null,
}));
vi.mock('../../../src/components/site/related-settings', () => ({
  RelatedSettings: () => null,
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer: ReactNode;
  }) => createElement('main', null, children, footer),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/general',
  useRouter: () => ({ push: vi.fn() }),
}));
const saved: SiteSettingsResponse = {
  id: 1,
  name: 'Ariso',
  description: '',
  publicUrl: 'https://img.example.com',
  timeZone: 'UTC',
  logoKey: null,
  logoMime: null,
  faviconKey: null,
  faviconMime: null,
  updatedAt: '2026-10-08T00:00:00.000Z',
  githubCallbackUrl: 'https://img.example.com/api/auth/callback/github',
};
function InitialLoadHarness() {
  runtime.rendering = true;
  runtime.cursor = 0;
  try {
    return GeneralPage({
      name: saved.name,
      description: saved.description,
      email: 'owner@example.test',
      ownerName: 'Owner',
    });
  } finally {
    runtime.rendering = false;
  }
}
beforeEach(() => {
  runtime.cells = [];
  runtime.success = false;
  runtime.editor.mockReset();
});
afterEach(() => {
  runtime.rendering = false;
});
it('初始GET未完成时外壳会话过期，迟到成功不能重新进入编辑器', () => {
  const loading = InitialLoadHarness();
  expect(renderToStaticMarkup(loading)).toContain('正在读取站点信息');
  loading.props.shell.onSessionExpire();
  runtime.success = true;
  InitialLoadHarness();
  const html = renderToStaticMarkup(InitialLoadHarness());
  expect(html).toContain('会话已失效');
  expect(html).toContain('重新登录');
  expect(html).not.toContain('id="site-name"');
  expect(html).toMatch(
    /<button\b(?=[^>]*id="site-save")(?=[^>]*disabled=)[^>]*>/,
  );
  expect(runtime.enabled).toBe(false);
  expect(runtime.editor).not.toHaveBeenCalled();
});
it('会话未过期时成功读取仍正常进入四字段编辑器', () => {
  InitialLoadHarness();
  runtime.success = true;
  InitialLoadHarness();
  const html = renderToStaticMarkup(InitialLoadHarness());
  expect(html).toContain('id="site-name"');
  expect(html).not.toContain('会话已失效');
  expect(runtime.editor).toHaveBeenCalledOnce();
});
