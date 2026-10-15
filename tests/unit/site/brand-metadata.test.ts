import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/library' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
import { BrandMetadata } from '../../../src/components/site/brand-metadata';

beforeEach(() => {
  route.pathname = '/library';
});

function render(name = '旅行相册', faviconUrl: string | null = null) {
  return renderToStaticMarkup(
    createElement(BrandMetadata, {
      name,
      faviconUrl,
      faviconMime: faviconUrl ? 'image/png' : null,
    }),
  );
}

it.each(['/library', '/tags', '/settings/general', '/', '/login'])(
  'renders one live brand title on %s without a default icon',
  (pathname) => {
    route.pathname = pathname;
    const html = render();
    expect(html).toBe('<title>旅行相册</title>');
  },
);

it('renders the public share title in the initial HTML', () => {
  route.pathname = '/s/public-token';
  expect(render()).toBe('<title>旅行相册 · 相册分享</title>');
});

it.each([
  ['/forgot-password', '找回密码 · Ariso'],
  ['/reset-password', '重置密码 · Ariso'],
])('preserves the existing recovery title on %s', (pathname, title) => {
  route.pathname = pathname;
  expect(render()).toBe(`<title>${title}</title>`);
});

it('uses updated brand and versioned favicon props without adding a second title', () => {
  const html = render('新的站点名称', '/brand/favicon-new.png');
  expect(html).toContain('<title>新的站点名称</title>');
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html).toContain('rel="icon"');
  expect(html).toContain('href="/brand/favicon-new.png"');
  expect(html).toContain('type="image/png"');
});
