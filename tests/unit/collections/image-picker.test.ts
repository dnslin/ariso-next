import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AlbumImagePicker } from '../../../src/app/albums/image-picker';
import type { Album } from '../../../src/app/albums/api';

const state = vi.hoisted(() => ({
  pending: false,
  fetching: false,
  error: '',
}));

vi.mock('../../../src/app/albums/use-image-picker', () => ({
  useAlbumImagePicker: () => ({
    list: {
      isFetching: state.fetching,
      isPending: false,
      error: null,
      data: { items: [], memberIds: [], total: 0 },
    },
    pending: state.pending,
    unknownIds: [],
    selected: new Map(),
    failures: [],
    error: state.error,
    q: '',
    page: 1,
    pages: 1,
    setQuery: vi.fn(),
    clear: vi.fn(),
    submit: vi.fn(),
  }),
}));

// Avoid the server-only portal while keeping the real dialog's DOM filtering.
vi.mock('@heroui/react/modal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@heroui/react/modal')>();
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Modal: Object.assign(pass, {
      Backdrop: pass,
      Container: pass,
      Dialog: actual.Modal.Dialog,
      Heading: actual.Modal.Heading,
      Header: pass,
      Body: ({ children }: { children: ReactNode }) =>
        createElement('div', { 'data-testid': 'picker-scroll-body' }, children),
      Footer: pass,
    }),
  };
});

const album: Album = {
  id: 'album',
  name: '旅行',
  description: '',
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  imageCount: 0,
  publicImageCount: 0,
  cover: {
    imageId: null,
    mode: 'empty',
    preferredCoverImageId: null,
    temporaryFallback: false,
    displayName: null,
    status: 'empty',
    thumbnailUrl: null,
  },
};

it.each([
  { pending: false, fetching: false, busy: false },
  { pending: true, fetching: false, busy: true },
  { pending: false, fetching: true, busy: true },
])(
  'exposes picker read and write activity on the real dialog ($pending/$fetching)',
  ({ pending, fetching, busy }) => {
    Object.assign(state, { pending, fetching, error: '' });
    const html = renderToStaticMarkup(
      createElement(AlbumImagePicker, {
        album,
        isOpen: true,
        onClose: vi.fn(),
        onExpire: vi.fn(),
        onChanged: vi.fn(),
      }),
    );
    const dialog = html.match(
      /<section[^>]*data-testid="album-image-picker"[^>]*>/,
    )?.[0];
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain(`aria-busy="${busy}"`);
    expect(html).toContain('从图库选择');
  },
);

it('keeps submit feedback outside the scrolling image list and above the footer', () => {
  Object.assign(state, {
    pending: false,
    fetching: false,
    error: '相册刷新失败，已保留选择。',
  });
  const html = renderToStaticMarkup(
    createElement(AlbumImagePicker, {
      album,
      isOpen: true,
      onClose: vi.fn(),
      onExpire: vi.fn(),
      onChanged: vi.fn(),
    }),
  );
  expect(html).toMatch(
    /data-testid="picker-scroll-body"[^>]*>.*?<\/div><div role="alert" data-testid="album-image-submit-error"/,
  );
  const feedback = html.match(
    /<div role="alert" data-testid="album-image-submit-error"[^>]*>/,
  )?.[0];
  expect(feedback).toContain('shrink-0');
  expect(feedback).toContain('max-h-[min(8rem,14dvh)]');
  expect(feedback).toContain('overflow-y-auto');
  expect(html.indexOf('相册刷新失败')).toBeLessThan(
    html.indexOf('data-testid="album-image-add"'),
  );
});
