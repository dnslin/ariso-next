import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AlbumCard } from '../../../src/app/albums/card';
import { AlbumCoverImage } from '../../../src/app/albums/cover-preview';
import type { Album } from '../../../src/app/albums/api';

const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [
      hooks.cells[index],
      (next: unknown) => {
        hooks.cells[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    return (hooks.cells[index] ??= { current: initial });
  },
}));
vi.mock('react-dom', () => ({ createPortal: (node: ReactNode) => node }));
const album = {
  id: 'album',
  name: '旅行',
  imageCount: 2,
  cover: { imageId: null, status: 'empty', thumbnailUrl: null },
} as Album;
const actions = {
  onOpen: vi.fn(),
  onEdit: vi.fn(),
  onShare: vi.fn(),
  onDelete: vi.fn(),
};
function render() {
  hooks.cursor = 0;
  return AlbumCard({ album, ...actions });
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as ReactNode)]
      : [],
  );
}
beforeEach(() => {
  vi.stubGlobal('document', { body: {} });
  hooks.cells = [];
  vi.clearAllMocks();
});

it('provides a touch-accessible menu beside, not inside, the album navigation link', () => {
  const tree = render();
  const all = elements(tree);
  const link = all.find((element) => element.props.href === '/albums/album')!;
  expect(
    elements(link.props.children as ReactNode).some(
      (element) => 'onAction' in element.props,
    ),
  ).toBe(false);
  expect(
    all.find((element) => element.props['aria-label'] === '相册操作：旅行')
      ?.props.isIconOnly,
  ).toBe(true);
  const menu = all.find(
    (element) => typeof element.props.onAction === 'function',
  )!;
  expect(
    elements(menu)
      .filter((element) => 'textValue' in element.props)
      .map((element) => element.props.textValue),
  ).toEqual(['打开相册', '编辑相册', '分享设置', '删除相册']);
  for (const key of ['open', 'edit', 'share', 'delete'])
    (menu.props.onAction as (key: string) => void)(key);
  Object.values(actions).forEach((action) =>
    expect(action).toHaveBeenCalledTimes(1),
  );
});

it('opens the same menu at the mouse position and from Shift+F10', () => {
  const preventDefault = vi.fn();
  const target = {
    getBoundingClientRect: () => ({ left: 10, bottom: 100 }),
  } as HTMLElement;
  render().props.onContextMenu({
    preventDefault,
    clientX: 40,
    clientY: 70,
    currentTarget: { querySelector: () => target },
  } as never);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(
    elements(render()).find(
      (element) => element.props['aria-hidden'] && element.props.style,
    )?.props.style,
  ).toEqual({ left: 40, top: 70 });
  render().props.onKeyDown({
    preventDefault,
    key: 'F10',
    shiftKey: true,
    target,
  } as never);
  expect(
    elements(render()).find(
      (element) => element.props['aria-hidden'] && element.props.style,
    )?.props.style,
  ).toEqual({ left: 26, top: 92 });
  expect(
    elements(render()).find((element) => 'isOpen' in element.props)?.props
      .isOpen,
  ).toBe(true);
});

it('keeps the cover identity when its name changes and replaces it when its image changes', () => {
  const cover = {
    ...album.cover,
    imageId: 'cover-image',
    status: 'ready' as const,
    thumbnailUrl: '/api/images/cover-image/thumbnail',
    displayName: 'before.png',
  };
  function image(nextCover: Album['cover']) {
    hooks.cursor = 0;
    return elements(
      AlbumCard({ album: { ...album, cover: nextCover }, ...actions }),
    ).find((element) => element.type === AlbumCoverImage)!;
  }
  const initial = image(cover);
  const renamed = image({ ...cover, displayName: 'after.png' });
  expect(renamed.type).toBe(initial.type);
  expect(renamed.key).toBe(initial.key);
  expect(renamed.props.cover).toMatchObject({ displayName: 'after.png' });
  expect(
    image({ ...cover, thumbnailUrl: '/api/images/other/thumbnail' }).key,
  ).not.toBe(initial.key);
});

afterEach(() => vi.unstubAllGlobals());
