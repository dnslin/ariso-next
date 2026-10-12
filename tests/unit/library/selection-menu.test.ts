import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { LibrarySelectionMenu } from '../../../src/app/library/library-selection-menu';
import type { LibrarySelection } from '../../../src/app/library/use-library-selection';

vi.mock('@heroui/react/dropdown', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@heroui/react/dropdown')>();
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Dropdown: Object.assign(pass, {
      ...actual.Dropdown,
      Popover: ({
        children,
        className,
      }: {
        children: ReactNode;
        className: string;
      }) =>
        createElement(
          'div',
          { 'data-slot': 'dropdown-popover', className },
          children,
        ),
    }),
  };
});

const selection: LibrarySelection = {
  selected: new Map([
    [
      'image',
      {
        id: 'image',
        displayName: 'image.png',
        visibility: 'private',
        hasAlbums: true,
        thumbnailUrl: null,
        storage: { id: 'local', name: '本地', enabled: true },
      },
    ],
  ]),
  currentIds: new Set(['image']),
  currentCount: 1,
  otherCount: 0,
  reconcile: vi.fn(),
  toggle: vi.fn(),
  selectIds: vi.fn(),
  remove: vi.fn(),
  recordFailure: vi.fn(),
  clearFailure: vi.fn(),
  clear: vi.fn(),
  selectCurrent: vi.fn(),
  deselectCurrent: vi.fn(),
};

it.each(['normal', 'trash'] as const)(
  'keeps the %s keyboard menu as the scroll region inside its bounded popover',
  (scope) => {
    const html = renderToStaticMarkup(
      createElement(LibrarySelectionMenu, {
        selection,
        scope,
        loadingMode: 'pages',
        disabled: false,
        onOpen: vi.fn(),
        onBatch: vi.fn(),
        onPermanentDelete: vi.fn(),
      }),
    );
    const popover = html.match(
      /<div[^>]*data-slot="dropdown-popover"[^>]*>/,
    )?.[0];
    const popoverClasses = popover?.match(/class="([^"]*)"/)?.[1].split(' ');
    expect(popoverClasses).toContain('flex');
    expect(popoverClasses).toContain('flex-col');
    expect(popoverClasses).toContain('overflow-hidden');
    const menu = html.match(/<div[^>]*data-slot="dropdown-menu"[^>]*>/)?.[0];
    const menuClasses = menu?.match(/class="([^"]*)"/)?.[1].split(' ');
    expect(menu).toContain('role="menu"');
    expect(menuClasses).toContain('min-h-0');
    expect(menuClasses).toContain('flex-1');
    expect(menuClasses).toContain('overflow-y-auto');
    expect(html).toMatch(/<p class="[^"]*shrink-0[^"]*">当前页/);
  },
);

it('blocks pending actions without making the operation trigger unfocusable', () => {
  const html = renderToStaticMarkup(
    createElement(LibrarySelectionMenu, {
      selection,
      loadingMode: 'pages',
      disabled: false,
      pending: true,
      onOpen: vi.fn(),
      onBatch: vi.fn(),
    }),
  );
  const trigger = html.match(
    /<button[^>]*aria-label="管理选择，已选 1 张"[^>]*>/,
  )?.[0];
  expect(trigger).toContain('aria-disabled="true"');
  expect(trigger).toContain('data-pending="true"');
  expect(trigger).not.toMatch(/\sdisabled(?:=|\s|>)/);
  const items = html.match(/<div[^>]*role="menuitem"[^>]*>/g) ?? [];
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) expect(item).toContain('aria-disabled="true"');
});

it('separates selection management and shortcut icons from the business menu', () => {
  const html = renderToStaticMarkup(
    createElement(LibrarySelectionMenu, {
      selection,
      loadingMode: 'pages',
      disabled: false,
      onOpen: vi.fn(),
      onBatch: vi.fn(),
    }),
  );
  expect(html).toContain('aria-label="管理选择，已选 1 张"');
  for (const label of ['复制链接', '添加到相册', '添加标签']) {
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).not.toMatch(
      new RegExp(`<div[^>]*role="menuitem"[^>]*data-key="${label}"`),
    );
  }
  for (const old of [
    '查看已选清单',
    '全选当前页',
    '取消当前页选择',
    '清空全部选择',
  ])
    expect(html).not.toContain(`textValue="${old}"`);
  expect(html).toContain('更多图片操作');
});
