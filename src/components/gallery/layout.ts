export type GalleryLayout = 'grid' | 'masonry';
export interface GallerySlot {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  imageHeight: number;
}

export function galleryMetrics(width: number, viewportWidth: number) {
  const columns = viewportWidth >= 1200 ? 4 : viewportWidth >= 768 ? 3 : 2;
  const gap = viewportWidth >= 1200 ? 20 : 12;
  return {
    columns,
    gap,
    cardWidth: Math.max(0, (width - gap * (columns - 1)) / columns),
  };
}

/** Data owners supply card dimensions; placement and bounded rendering share no DTO. */
export function positionGalleryCards(
  cards: { imageHeight: number; height: number }[],
  layout: GalleryLayout,
  metrics: ReturnType<typeof galleryMetrics>,
) {
  const { columns, gap, cardWidth } = metrics;
  const lanes: GallerySlot[][] = Array.from({ length: columns }, () => []);
  const bottoms = Array<number>(columns).fill(0);
  const slots: GallerySlot[] = [];
  let rowTop = 0;
  let rowHeight = 0;
  cards.forEach(({ imageHeight, height }, index) => {
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
    height: Math.max(0, ...bottoms) - (cards.length ? gap : 0),
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
