import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteLogo } from '../../../src/components/site/logo';
import { ShareBrandHeading } from '../../../src/components/sharing/brand';

const state = vi.hoisted(() => ({ failedUrl: null as string | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [state.failedUrl, (url: string) => (state.failedUrl = url)],
}));

beforeEach(() => {
  state.failedUrl = null;
});

const logo = (url = '/branding/logo-v1.svg') =>
  SiteLogo({ url, name: '测试站点', className: 'h-12 w-24' });

it('renders the configured version URL as an image with the site name', () => {
  const html = renderToStaticMarkup(logo());
  expect(html).toContain('src="/branding/logo-v1.svg"');
  expect(html).toContain('alt="测试站点 Logo"');
  expect(html).not.toContain('无法加载');
});

it('shows an unavailable asset instead of silently using the built-in wordmark', () => {
  const image = logo().props.children as ReactElement<{
    onError: () => void;
  }>;
  image.props.onError();
  const failed = renderToStaticMarkup(logo());
  expect(failed).toContain('测试站点 Logo 无法加载');
  expect(failed).not.toContain('<img');
  expect(failed).not.toContain('Ariso');
  const replaced = renderToStaticMarkup(logo('/branding/logo-v2.png'));
  expect(replaced).toContain('src="/branding/logo-v2.png"');
  expect(replaced).not.toContain('无法加载');
});

it.each([
  { complete: true, naturalWidth: 0, unavailable: true },
  { complete: true, naturalWidth: 64, unavailable: false },
  { complete: false, naturalWidth: 0, unavailable: false },
])(
  'recognizes an image that finished before hydration: %j',
  ({ complete, naturalWidth, unavailable }) => {
    const image = logo().props.children as ReactElement<{
      ref: (image: HTMLImageElement | null) => void;
    }>;
    image.props.ref({ complete, naturalWidth } as HTMLImageElement);
    const html = renderToStaticMarkup(logo());
    expect(html.includes('Logo 无法加载')).toBe(unavailable);
    expect(html.includes('<img')).toBe(!unavailable);
    image.props.ref(null);
    expect(renderToStaticMarkup(logo())).toBe(html);
    const replaced = renderToStaticMarkup(logo('/branding/logo-v2.png'));
    expect(replaced).toContain('src="/branding/logo-v2.png"');
    expect(replaced).not.toContain('无法加载');
  },
);

it('uses the real logo in share headings and restores the text only after deletion', () => {
  const brand = {
    name: '分享站点',
    description: '站点描述',
    logoUrl: '/branding/share-logo.png',
  };
  const uploaded = renderToStaticMarkup(
    createElement(ShareBrandHeading, { brand, description: true }),
  );
  expect(uploaded).toContain('src="/branding/share-logo.png"');
  expect(uploaded).toContain('站点描述');
  const deleted = renderToStaticMarkup(
    createElement(ShareBrandHeading, {
      brand: { ...brand, logoUrl: null },
    }),
  );
  expect(deleted).not.toContain('<img');
  expect(deleted).toContain('分享站点');
  expect(deleted).not.toContain('站点描述');
});
