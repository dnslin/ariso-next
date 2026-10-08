import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GeneralPage } from '../../../src/components/site/general-page';
import type { useSiteSettings } from '../../../src/components/site/use-site-settings';
import type { SiteSettingsResponse } from '../../../src/components/site/api';
import { SiteForm } from '../../../src/components/site/site-form';

const state = vi.hoisted(() => ({
  settings: {} as ReturnType<typeof useSiteSettings>,
}));
vi.mock('../../../src/components/site/use-site-settings', () => ({
  useSiteSettings: () => state.settings,
}));
vi.mock('../../../src/components/site/site-navigation', () => ({
  useSiteNavigation: () => ({
    destination: null,
    navigate: vi.fn(),
    cancel: vi.fn(),
    discard: vi.fn(),
  }),
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
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    isFetchedAfterMount: true,
    isFetching: false,
    isSuccess: true,
    data: state.settings.saved,
  }),
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
beforeEach(() => {
  state.settings = {
    saved,
    input: {
      name: '待保存名称',
      description: '待保存描述',
      publicUrl: 'https://draft.example.com',
      timeZone: 'Asia/Shanghai',
    },
    phase: 'ready',
    expired: true,
    locked: true,
    errors: {},
    message: '',
    originNotice: false,
    timeZoneNotice: false,
    expire: vi.fn(),
    change: vi.fn(),
    save: vi.fn(),
    reconcile: vi.fn(),
    chooseSaved: vi.fn(),
  };
});
it.each(['ready', 'saving'] as const)(
  '会话失效时 phase=%s 保留四个可见草稿，锁住字段与保存按钮且结束保存中反馈',
  (phase) => {
    state.settings.phase = phase;
    const html = renderToStaticMarkup(
      createElement(GeneralPage, {
        name: saved.name,
        description: saved.description,
        email: 'owner@example.test',
        ownerName: 'Owner',
      }),
    );
    expect(html).toContain('当前输入已保留，请重新登录后核对服务器设置。');
    expect(html).toContain('重新登录');
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    for (const [name, value] of Object.entries(state.settings.input)) {
      const field = inputs.find((input) => input.includes(`name="${name}"`));
      expect(field, `${name} remains visible`).toBeDefined();
      expect(field).toContain(`value="${value}"`);
      expect(field).toMatch(/\bdisabled=/);
    }
    const save = html.match(
      /<button\b(?=[^>]*id="site-save")[^>]*>([\s\S]*?)<\/button>/,
    );
    expect(save).not.toBeNull();
    expect(save![0]).toMatch(/\bdisabled=/);
    expect(save![1]).toContain('保存站点信息');
    expect(save![1]).not.toContain('正在保存');
  },
);
it('四字段标签关联真实输入ID，保留既有selector供错误聚焦与点击标签使用', () => {
  state.settings.expired = false;
  state.settings.locked = false;
  const html = renderToStaticMarkup(
    createElement(SiteForm, { settings: state.settings }),
  );
  for (const name of Object.keys(state.settings.input)) {
    expect(html).toMatch(
      new RegExp(`<label\\b(?=[^>]*for="site-${name}")[^>]*>`),
    );
    expect(html).toMatch(
      new RegExp(
        `<input\\b(?=[^>]*id="site-${name}")(?=[^>]*name="${name}")[^>]*>`,
      ),
    );
  }
});
