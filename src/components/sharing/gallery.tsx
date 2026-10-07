'use client';

import { useMemo, useRef } from 'react';
import { Button } from '@heroui/react/button';
import type { PublicShareItem } from '../../server/sharing/public-types';
import { visibleGalleryIndexes, type GalleryLayout } from '../gallery/layout';
import { useGalleryViewport } from '../gallery/use-gallery-viewport';
import { layoutShareGallery } from './gallery-layout';
import { ShareThumbnail } from './thumbnail';

export function ShareGallery({
  items,
  layout,
  showName,
  onThumbnailFailure,
  onOpen,
}: {
  items: PublicShareItem[];
  layout: GalleryLayout;
  showName: boolean;
  onThumbnailFailure: (imageId: string) => void;
  onOpen: (imageId: string, source: HTMLElement) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const viewport = useGalleryViewport(container, '[data-share-scroll]', true);
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
                  {item.previewUrl ? (
                    <Button
                      data-share-open={item.imageId}
                      aria-label={
                        showName ? `查看图片：${item.displayName}` : '查看图片'
                      }
                      variant="ghost"
                      className="size-full min-w-0 overflow-hidden rounded-none p-0"
                      onPress={(event) =>
                        onOpen(item.imageId, event.target as HTMLElement)
                      }
                    >
                      <ShareThumbnail
                        item={item}
                        onFailure={onThumbnailFailure}
                      />
                    </Button>
                  ) : (
                    <ShareThumbnail
                      item={item}
                      onFailure={onThumbnailFailure}
                    />
                  )}
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
