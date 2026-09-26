import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import ErrorPage from '../../../src/app/error';
import { PublicShell } from '../../../src/components/shell/public-shell';

const route = vi.hoisted(() => ({ pathname: '/settings/media/detail' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

function renderAdmin(pathname: string) {
  route.pathname = pathname;
  return renderToStaticMarkup(
    jsx(AdminShell, {
      name: '测试站点',
      navigation: [
        { href: '/', label: '首页' },
        { href: '/settings', label: '设置' },
        { href: '/settings/media', label: '媒体设置' },
      ],
      user: '当前用户',
      children: '主要内容',
    }),
  );
}

describe('后台壳层导航', () => {
  it('只展示组合方提供的入口，并保留主内容和用户区域', () => {
    const html = renderAdmin('/settings');
    const navigation = html.match(
      /<nav[^>]*aria-label="后台导航"[^>]*>([\s\S]*?)<\/nav>/,
    )?.[1];
    expect(navigation).toBeDefined();
    expect(
      [...navigation!.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
    ).toEqual(['/', '/settings', '/settings/media']);
    expect(html).toContain('当前用户');
    expect(html).toMatch(/<main[^>]*id="main-content"[^>]*>主要内容<\/main>/);
    expect(html).toContain('href="#main-content"');
    expect(html).not.toMatch(/href="\/(login|upload|images|setup)"/);
  });

  it.each([
    ['/settings/media/detail', '/settings/media'],
    ['/settings/media', '/settings/media'],
    ['/settings/other', '/settings'],
    ['/settings-extra', undefined],
    ['/unavailable', undefined],
    ['/', '/'],
  ])('路径 %s 只将最长匹配入口 %s 标为当前页', (pathname, expected) => {
    const anchors = renderAdmin(pathname).match(/<a\b[^>]*>/g) ?? [];
    const current = anchors.filter((anchor) =>
      anchor.includes('aria-current="page"'),
    );
    expect(current).toHaveLength(expected ? 1 : 0);
    if (expected) expect(current[0]).toContain(`href="${expected}"`);
  });
});

describe('公共壳层', () => {
  it('子页面提供返回首页的真实链接', () => {
    const html = renderToStaticMarkup(jsx(PublicShell, { children: '子页面' }));
    expect(html).toMatch(
      /<a[^>]*href="\/"[^>]*><svg[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>返回首页<\/a>/,
    );
    expect(html).toContain('子页面');
  });

  it('首页不显示返回自身的链接', () => {
    const html = renderToStaticMarkup(
      jsx(PublicShell, { home: true, children: '首页' }),
    );
    expect(html).not.toContain('返回首页');
    expect(html).not.toContain('href="/"');
  });
});

describe('公共错误页面', () => {
  it('失败时提供明确错误、重试和首页出口，不显示默认成功内容', () => {
    const html = renderToStaticMarkup(jsx(ErrorPage, { retry: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('页面加载失败');
    expect(html).toMatch(/<button[^>]*>重试<\/button>/);
    expect(html).toMatch(
      /<a[^>]*href="\/"[^>]*><svg[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>返回首页<\/a>/,
    );
    expect(html).not.toContain('轻装简从');
  });
});
