import type { PublicShareItem } from '../../server/sharing/public-types';
import {
  galleryMetrics,
  positionGalleryCards,
  type GalleryLayout,
} from '../gallery/layout';

export function layoutShareGallery(
  items: PublicShareItem[],
  layout: GalleryLayout,
  width: number,
  viewportWidth: number,
  showName: boolean,
) {
  const metrics = galleryMetrics(width, viewportWidth);
  return positionGalleryCards(
    items.map((item) => {
      const imageHeight =
        metrics.cardWidth / (layout === 'masonry' ? item.aspectRatio : 4 / 3);
      return { imageHeight, height: imageHeight + (showName ? 30 : 0) };
    }),
    layout,
    metrics,
  );
}
