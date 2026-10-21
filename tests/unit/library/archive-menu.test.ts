import {
  Children,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  ArchiveMenu,
  ArchiveVersionMenu,
} from '../../../src/components/library/archive-menu';

vi.mock('@heroui/react/dropdown', async (original) => {
  const actual = await original<typeof import('@heroui/react/dropdown')>();
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Dropdown: Object.assign(pass, {
      ...actual.Dropdown,
      Popover: pass,
    }),
  };
});

const render = (props: Partial<ComponentProps<typeof ArchiveMenu>> = {}) =>
  renderToStaticMarkup(
    createElement(ArchiveMenu, {
      disabled: false,
      pending: false,
      separator: false,
      onDownload: vi.fn(),
      ...props,
    }),
  );

it('offers the four fixed download versions without opening a manifest or confirmation dialog', () => {
  const html = render();
  expect(html).toContain('aria-label="打包下载"');
  expect(html).toContain('aria-label="打包下载版本"');
  expect(html).toContain('下载版本');
  for (const version of ['原图', '压缩图', '缩略图', '水印图'])
    expect(html).toContain(version);
  expect(html.match(/role="menuitem"/g)).toHaveLength(4);
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain('本次下载清单');
  expect(html).not.toContain('开始下载');
});

it('disables the entry and its version actions when the selected images are unavailable', () => {
  const html = render({ disabled: true });
  const trigger = html.match(
    /<button[^>]*data-testid="library-archive-trigger"[^>]*>/,
  )?.[0];
  expect(trigger).toMatch(/\sdisabled(?:=|\s|>)/);
  const items = html.match(/<div[^>]*role="menuitem"[^>]*>/g) ?? [];
  expect(items).toHaveLength(4);
  for (const item of items) expect(item).toContain('aria-disabled="true"');
});

it('shows preparation on the existing trigger and blocks version actions while pending', () => {
  const html = render({ pending: true });
  const trigger = html.match(
    /<button[^>]*data-testid="library-archive-trigger"[^>]*>/,
  )?.[0];
  expect(trigger).toContain('data-pending="true"');
  expect(trigger).toContain('aria-disabled="true"');
  const items = html.match(/<div[^>]*role="menuitem"[^>]*>/g) ?? [];
  expect(items).toHaveLength(4);
  for (const item of items) expect(item).toContain('aria-disabled="true"');
});

it('dispatches the chosen version directly without a second confirmation or exclusion action', () => {
  const onDownload = vi.fn();
  const tree = ArchiveVersionMenu({ disabled: false, onDownload });
  const menu = Children.toArray(tree.props.children).find(
    (node) =>
      isValidElement<Record<string, unknown>>(node) &&
      node.props['data-testid'] === 'library-archive-menu',
  );
  if (!isValidElement<{ onAction: (key: string) => void }>(menu))
    throw new Error('The version menu is missing');
  menu.props.onAction('watermark');
  expect(onDownload).toHaveBeenCalledExactlyOnceWith('watermark');
  const html = render();
  expect(html).not.toContain('排除');
  expect(html).not.toContain('重新检查');
});
