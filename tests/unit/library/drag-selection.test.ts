import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryDragSelection } from '../../../src/app/library/gallery-drag-selection';
import type { LibrarySelection } from '../../../src/app/library/use-library-selection';
import type { LibraryItem } from '../../../src/server/library/types';
import type { useSelectionContainer } from '@air/react-drag-to-select';

const capture = vi.hoisted(() => ({
  options: null as Parameters<typeof useSelectionContainer>[0] | null,
}));
vi.mock('@air/react-drag-to-select', async (original) => ({
  ...(await original<typeof import('@air/react-drag-to-select')>()),
  useSelectionContainer: (
    options: Parameters<typeof useSelectionContainer>[0],
  ) => {
    capture.options = options;
    return { DragSelection: () => null, cancelCurrentSelection: vi.fn() };
  },
}));

function start() {
  const selectIds = vi.fn();
  const selection = {
    selected: new Map([
      ['manual', {}],
      ['other-page', {}],
    ]),
    currentIds: new Set(['manual', 'dragged']),
    selectIds,
  } as unknown as LibrarySelection;
  const slots: ComponentProps<typeof GalleryDragSelection>['slots'] = [
    { index: 0, left: 0, top: 0, width: 100, height: 100, imageHeight: 80 },
    { index: 1, left: 120, top: 0, width: 100, height: 100, imageHeight: 80 },
  ];
  renderToStaticMarkup(
    createElement(GalleryDragSelection, {
      container: { current: null },
      slots,
      items: [{ id: 'manual' }, { id: 'dragged' }] as LibraryItem[],
      selection,
      disabled: false,
      onDragStart: vi.fn(),
    }),
  );
  capture.options!.onSelectionStart!({
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
  } as MouseEvent);
  return selectIds;
}

describe('gallery mouse selection', () => {
  beforeEach(() => {
    capture.options = null;
  });

  it('keeps a previously checked current-page image and other pages without modifier keys', () => {
    const selectIds = start();
    capture.options!.isValidSelectionStart!({
      left: 130,
      top: 10,
      width: 50,
      height: 50,
    });
    capture.options!.onSelectionChange!({
      left: 130,
      top: 10,
      width: 50,
      height: 50,
    });
    expect(selectIds).toHaveBeenLastCalledWith([
      'manual',
      'other-page',
      'dragged',
    ]);
  });

  it('shrinks only new drag hits and keeps the complete pre-drag selection on mouseup', () => {
    const selectIds = start();
    capture.options!.isValidSelectionStart!({
      left: 130,
      top: 10,
      width: 50,
      height: 50,
    });
    capture.options!.onSelectionChange!({
      left: 130,
      top: 10,
      width: 50,
      height: 50,
    });
    capture.options!.isValidSelectionStart!({
      left: 110,
      top: 10,
      width: 1,
      height: 1,
    });
    capture.options!.onSelectionEnd!({} as MouseEvent);
    expect(selectIds).toHaveBeenLastCalledWith(['manual', 'other-page']);
  });
});
