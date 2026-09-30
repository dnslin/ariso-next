'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem } from '../../server/library/types';
import {
  layoutGallery,
  visibleGalleryIndexes,
  type GalleryLayout,
} from './gallery-layout';
import { LibraryCard } from './library-card';
import { GalleryDragSelection } from './gallery-drag-selection';
import type { LibrarySelection } from './use-library-selection';

export function LibraryGallery({
  items,
  layout,
  album = false,
  disabled,
  selection,
  onOpen,
}: {
  items: LibraryItem[];
  layout: GalleryLayout;
  album?: boolean;
  disabled: boolean;
  selection: LibrarySelection;
  onOpen: (id: string, element: HTMLElement) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    width: 0,
    windowWidth: 0,
    top: 0,
    height: 0,
  });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useLayoutEffect(() => {
    const element = container.current!;
    const scroller = element.closest('main')!;
    let frame = 0;
    function measure() {
      const rect = element.getBoundingClientRect();
      const scrollRect = scroller.getBoundingClientRect();
      setViewport({
        width: rect.width,
        windowWidth: window.innerWidth,
        top: scrollRect.top - rect.top,
        height: scroller.clientHeight,
      });
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(scroller);
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
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
      style={{ height: viewport.width ? positions.height : 210 }}
    >
      <GalleryDragSelection
        container={container}
        slots={positions.slots}
        items={items}
        selection={selection}
        disabled={disabled}
      />
      {viewport.width
        ? indexes.map((index) => {
            const slot = positions.slots[index];
            const item = items[index];
            return (
              <div
                key={item.id}
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
                <LibraryCard
                  item={item}
                  squareMobileTop={!album}
                  album={album}
                  imageHeight={slot.imageHeight}
                  isDisabled={disabled}
                  isSelected={selection.selected.has(item.id)}
                  onToggle={selection.toggle}
                  onOpen={onOpen}
                />
              </div>
            );
          })
        : null}
    </div>
  );
}
