'use client';

import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { componentEase, useReducedMotion } from '../../components/motion';
import type { LibraryItem } from '../../server/library/types';
import { layoutGallery } from './gallery-layout';
import {
  visibleGalleryIndexes,
  type GalleryLayout,
} from '../../components/gallery/layout';
import { useGalleryViewport } from '../../components/gallery/use-gallery-viewport';
import { LibraryCard } from './library-card';
import { LibraryCardEntrance } from './library-motion';
import { GalleryDragSelection } from './gallery-drag-selection';
import type { LibrarySelection } from './use-library-selection';
import type { LibraryContextMenu } from './library-selection-menu';

export function LibraryGallery({
  items,
  readRevision,
  layout,
  album = false,
  disabled,
  selection,
  onOpen,
  onContextMenu,
}: {
  items: LibraryItem[];
  readRevision: number;
  layout: GalleryLayout;
  album?: boolean;
  disabled: boolean;
  selection: LibrarySelection;
  onOpen: (id: string, element: HTMLElement) => void;
  onContextMenu: (menu: LibraryContextMenu) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const entered = useRef(new Set<string>());
  const loadedThumbnails = useRef(new Set<string>());
  const reduce = useReducedMotion();
  const viewport = useGalleryViewport(container, 'main');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const positions = useMemo(
    () =>
      layoutGallery(items, layout, viewport.width, viewport.windowWidth, album),
    [items, layout, viewport.width, viewport.windowWidth, album],
  );
  const focusedIndex = useMemo(
    () => items.findIndex((item) => item.id === focusedId),
    [items, focusedId],
  );
  const indexes = visibleGalleryIndexes(
    positions.lanes,
    viewport.top - 600,
    viewport.top + viewport.height + 600,
    focusedIndex,
    items.length,
  );
  function openContextMenu(
    target: EventTarget | null,
    point?: { x: number; y: number },
  ) {
    if (disabled || !(target instanceof Element)) return false;
    const card = target.closest<HTMLElement>('[data-image-id]');
    const item = items.find((item) => item.id === card?.dataset.imageId);
    if (!item && !selection.selected.size) return false;
    if (item && !selection.selected.has(item.id))
      selection.selectIds([item.id]);
    const origin =
      card?.querySelector<HTMLElement>('[data-library-open]') ??
      container.current!;
    origin.focus({ preventScroll: true });
    const rect = origin.getBoundingClientRect();
    onContextMenu({
      x: point?.x ?? rect.left + rect.width / 2,
      y: point?.y ?? rect.top + Math.min(rect.height / 2, 40),
      target: origin,
    });
    return true;
  }
  return (
    <div
      ref={container}
      role="list"
      aria-label="图库图片"
      aria-busy={disabled}
      data-testid="library-gallery"
      data-layout={layout}
      data-columns={positions.lanes.length}
      className="relative w-full"
      onPointerDownCapture={(event) => {
        if (event.button === 0) dragged.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') dragged.current = false;
        if (
          (event.key === 'ContextMenu' ||
            (event.shiftKey && event.key === 'F10')) &&
          openContextMenu(event.target)
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClickCapture={(event) => {
        if (dragged.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onContextMenu={(event) => {
        if (
          openContextMenu(event.target, { x: event.clientX, y: event.clientY })
        )
          event.preventDefault();
      }}
      style={{ height: viewport.width ? positions.height : 210 }}
    >
      <GalleryDragSelection
        container={container}
        slots={positions.slots}
        items={items}
        selection={selection}
        disabled={disabled}
        onDragStart={() => {
          dragged.current = true;
        }}
      />
      {viewport.width
        ? indexes.map((index) => {
            const slot = positions.slots[index];
            const item = items[index];
            return (
              <motion.div
                key={item.id}
                layout={reduce ? false : 'position'}
                transition={{ duration: 0.24, ease: componentEase }}
                role="listitem"
                aria-posinset={index + 1}
                aria-setsize={items.length}
                className="absolute"
                style={{
                  left: slot.left,
                  top: slot.top,
                  width: slot.width,
                  height: slot.height,
                }}
                onFocusCapture={() => setFocusedId(item.id)}
              >
                <LibraryCardEntrance
                  id={item.id}
                  index={index}
                  entered={entered}
                  loadedThumbnails={loadedThumbnails}
                  reduce={reduce}
                >
                  <LibraryCard
                    item={item}
                    readRevision={readRevision}
                    album={album}
                    imageHeight={slot.imageHeight}
                    isDisabled={disabled}
                    isSelected={selection.selected.has(item.id)}
                    onToggle={selection.toggle}
                    onOpen={(id, element) => {
                      if (!dragged.current) onOpen(id, element);
                    }}
                  />
                </LibraryCardEntrance>
              </motion.div>
            );
          })
        : null}
    </div>
  );
}
