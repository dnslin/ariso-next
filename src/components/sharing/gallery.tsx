'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicShareItem } from '../../server/sharing/public-types';
import { visibleGalleryIndexes, type GalleryLayout } from '../gallery/layout';
import { layoutShareGallery } from './gallery-layout';
import { ShareThumbnail } from './thumbnail';

export function ShareGallery({
  items,
  layout,
  showName,
  onThumbnailFailure,
}: {
  items: PublicShareItem[];
  layout: GalleryLayout;
  showName: boolean;
  onThumbnailFailure: (imageId: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    width: 0,
    windowWidth: 0,
    top: 0,
    height: 0,
  });
  useLayoutEffect(() => {
    const element = container.current!;
    const scroller = element.closest<HTMLElement>('[data-share-scroll]')!;
    let frame = 0;
    function measure() {
      const rect = element.getBoundingClientRect();
      if (!rect.width) return;
      setViewport({
        width: rect.width,
        windowWidth: window.innerWidth,
        top: scroller.getBoundingClientRect().top - rect.top,
        height: scroller.clientHeight,
      });
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(element.parentElement!);
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
      layoutShareGallery(
        items,
        layout,
        viewport.width,
        viewport.windowWidth,
        showName,
      ),
    [items, layout, viewport.width, viewport.windowWidth, showName],
  );
  const indexes = visibleGalleryIndexes(
    positions.lanes,
    viewport.top - 600,
    viewport.top + viewport.height + 600,
    -1,
    items.length,
  );
  return (
    <div
      ref={container}
      role="list"
      aria-label="相册图片"
      data-testid="share-items"
      data-layout={layout}
      data-share-loaded-count={items.length}
      data-columns={positions.lanes.length}
      className="relative w-full"
      style={{ height: viewport.width ? positions.height : 206 }}
    >
      {viewport.width
        ? indexes.map((index) => {
            const item = items[index];
            const slot = positions.slots[index];
            return (
              <div
                key={item.imageId}
                role="listitem"
                aria-posinset={index + 1}
                aria-setsize={items.length}
                data-share-item={item.imageId}
                data-share-status={item.status}
                className="absolute overflow-hidden rounded-xl bg-surface"
                style={{
                  left: slot.left,
                  top: slot.top,
                  width: slot.width,
                  height: slot.height,
                }}
              >
                <div style={{ height: slot.imageHeight }}>
                  <ShareThumbnail item={item} onFailure={onThumbnailFailure} />
                </div>
                {showName ? (
                  <p
                    className="mt-2 truncate text-sm leading-[22px]"
                    title={item.displayName}
                  >
                    {item.displayName}
                  </p>
                ) : null}
              </div>
            );
          })
        : null}
    </div>
  );
}
