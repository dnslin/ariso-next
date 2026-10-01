'use client';

import { useEffect, useRef, type RefObject } from 'react';
import {
  boxesIntersect,
  useSelectionContainer,
  type Box,
} from '@air/react-drag-to-select';
import type { LibraryItem } from '../../server/library/types';
import type { GallerySlot } from './gallery-layout';
import type { LibrarySelection } from './use-library-selection';

/** Layout slots cover loaded records, including cards outside the DOM window. */
export function intersectingGalleryIds(
  box: Box,
  slots: GallerySlot[],
  items: LibraryItem[],
) {
  return slots
    .filter((slot) => boxesIntersect(box, slot))
    .map((slot) => items[slot.index].id);
}

export function GalleryDragSelection({
  container,
  slots,
  items,
  selection,
  disabled,
  onDragStart,
}: {
  container: RefObject<HTMLDivElement | null>;
  slots: GallerySlot[];
  items: LibraryItem[];
  selection: LibrarySelection;
  disabled: boolean;
  onDragStart: () => void;
}) {
  const { selectIds } = selection;
  const lastBox = useRef<Box | null>(null);
  const before = useRef<string[]>([]);
  const dragging = useRef(false);
  const bodyStyle = useRef<{
    userSelect: string;
    webkitUserSelect: string;
  } | null>(null);
  function restoreBodyStyle(release = true) {
    if (!bodyStyle.current) return;
    Object.assign(document.body.style, bodyStyle.current);
    if (release) bodyStyle.current = null;
  }
  function applyLocalBox(box: Box) {
    if (!dragging.current) return;
    selectIds([
      ...before.current,
      ...intersectingGalleryIds(box, slots, items),
    ]);
  }
  const { DragSelection, cancelCurrentSelection } = useSelectionContainer({
    isEnabled: !disabled,
    shouldStartSelecting: (target) => {
      if (
        !(target instanceof Element) ||
        !container.current?.contains(target) ||
        target.closest(
          'input, label, [role="checkbox"], button:not([data-library-open])',
        )
      )
        return false;
      bodyStyle.current = {
        userSelect: document.body.style.userSelect,
        webkitUserSelect: document.body.style.webkitUserSelect,
      };
      return true;
    },
    onSelectionStart: () => {
      dragging.current = true;
      onDragStart();
      before.current = [...selection.selected.keys()];
    },
    isValidSelectionStart: (box) => {
      // Air supplies every local box here, including a drag shrunk below its
      // starting threshold. Retain final geometry and require a deliberate drag.
      lastBox.current = box;
      return Math.hypot(box.width, box.height) >= 5;
    },
    onSelectionChange: () => {
      if (lastBox.current) applyLocalBox(lastBox.current);
    },
    onSelectionEnd: () => {
      // Air cancels its last change rAF on mouseup; commit its latest box now.
      if (lastBox.current) applyLocalBox(lastBox.current);
      dragging.current = false;
    },
    selectionProps: {
      'aria-hidden': true,
      style: {
        border: '1px solid var(--accent)',
        background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
        zIndex: 30,
      },
    },
  });
  useEffect(() => {
    function cancel() {
      dragging.current = false;
      cancelCurrentSelection();
      restoreBodyStyle(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !dragging.current) return;
      selectIds(before.current);
      cancel();
    }
    // The library owns mouse listeners; these cover cancellation and teardown.
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    function mouseup() {
      queueMicrotask(() => restoreBodyStyle());
    }
    window.addEventListener('mouseup', mouseup);
    if (disabled) cancel();
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('mouseup', mouseup);
    };
  }, [cancelCurrentSelection, disabled, selectIds]);
  useEffect(
    () => () => {
      dragging.current = false;
      cancelCurrentSelection();
      restoreBodyStyle();
    },
    [cancelCurrentSelection],
  );
  return <DragSelection />;
}
