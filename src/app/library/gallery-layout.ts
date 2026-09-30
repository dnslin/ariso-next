import type { LibraryItem } from '../../server/library/types';

export type GalleryLayout = 'grid' | 'masonry';

export function hasCardDiagnostics(item: LibraryItem) {
  return (
    item.format === 'unknown' ||
    !item.storage.enabled ||
    item.processingStatus !== 'ready'
  );
}

export function cardDiagnosticLines(item: LibraryItem) {
  return (
    Number(hasCardDiagnostics(item)) +
    Number(Boolean(item.activeJob)) +
    Number(Boolean(item.latestFailedJob))
  );
}

export interface GallerySlot {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  imageHeight: number;
}

/** Each lane is ordered vertically; the slots themselves retain server order. */
export function layoutGallery(
  items: LibraryItem[],
  layout: GalleryLayout,
  width: number,
  viewportWidth: number,
  album = false,
) {
  const desktop = viewportWidth >= 1200;
  const columns = desktop ? 4 : viewportWidth >= 768 ? 3 : 2;
  const gap = desktop ? 20 : 12;
  const cardWidth = Math.max(0, (width - gap * (columns - 1)) / columns);
  const lanes: GallerySlot[][] = Array.from({ length: columns }, () => []);
  const bottoms = Array<number>(columns).fill(0);
  const slots: GallerySlot[] = [];
  let rowTop = 0;
  let rowHeight = 0;
  items.forEach((item, index) => {
    const imageHeight =
      layout === 'masonry' && item.thumbnailDimensions
        ? ((cardWidth - (album ? 0 : 2)) * item.thumbnailDimensions.height) /
          item.thumbnailDimensions.width
        : desktop
          ? 190
          : 130;
    const height =
      imageHeight +
      (album ? (desktop ? 57 : 64.5) : desktop ? 82 : 80) +
      cardDiagnosticLines(item) * 22;
    const column =
      layout === 'grid'
        ? index % columns
        : bottoms.indexOf(Math.min(...bottoms));
    if (layout === 'grid' && column === 0 && index > 0) {
      rowTop += rowHeight + gap;
      rowHeight = 0;
    }
    rowHeight = Math.max(rowHeight, height);
    const slot = {
      index,
      left: column * (cardWidth + gap),
      top: layout === 'grid' ? rowTop : bottoms[column],
      width: cardWidth,
      height,
      imageHeight,
    };
    slots.push(slot);
    lanes[column].push(slot);
    bottoms[column] = slot.top + height + gap;
  });
  return {
    slots,
    lanes,
    height: Math.max(0, ...bottoms) - (items.length ? gap : 0),
  };
}

/** Binary search each lane, so scrolling does not scan all loaded records. */
export function visibleGalleryIndexes(
  lanes: GallerySlot[][],
  top: number,
  bottom: number,
  focusedIndex: number,
  count: number,
) {
  // Keep both boundaries so entering from either adjacent toolbar preserves order.
  const indexes = new Set<number>(count ? [0, count - 1] : []);
  for (const lane of lanes) {
    let low = 0;
    let high = lane.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const slot = lane[middle];
      if (slot.top + slot.height < top) low = middle + 1;
      else high = middle;
    }
    for (
      let index = low;
      index < lane.length && lane[index].top <= bottom;
      index++
    ) {
      indexes.add(lane[index].index);
    }
  }
  // Retain the trigger under a details dialog and its next/previous Tab target.
  if (focusedIndex >= 0) {
    for (
      let index = Math.max(0, focusedIndex - 1);
      index <= Math.min(count - 1, focusedIndex + 1);
      index++
    ) {
      indexes.add(index);
    }
  }
  return [...indexes].sort((a, b) => a - b);
}
