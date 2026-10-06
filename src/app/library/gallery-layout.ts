import type { LibraryItem } from '../../server/library/types';

import {
  galleryMetrics,
  positionGalleryCards,
  type GalleryLayout,
} from '../../components/gallery/layout';

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

/** Library diagnostics determine heights; anonymous consumers only reuse placement. */
export function layoutGallery(
  items: LibraryItem[],
  layout: GalleryLayout,
  width: number,
  viewportWidth: number,
  album = false,
) {
  const desktop = viewportWidth >= 1200;
  const metrics = galleryMetrics(width, viewportWidth);
  const cards = items.map((item) => {
    const imageHeight =
      layout === 'masonry' && item.thumbnailDimensions
        ? ((metrics.cardWidth - (album ? 0 : 2)) *
            item.thumbnailDimensions.height) /
          item.thumbnailDimensions.width
        : desktop
          ? 190
          : 130;
    const height =
      imageHeight +
      (album ? (desktop ? 57 : 64.5) : desktop ? 82 : 80) +
      cardDiagnosticLines(item) * 22;
    return { imageHeight, height };
  });
  return positionGalleryCards(cards, layout, metrics);
}
