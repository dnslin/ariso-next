import type { mediaImages } from '../media/schema.ts';
import { buildImagePath } from './links.ts';

export interface ThumbnailPresentation {
  status: 'processing' | 'failed' | 'disabled' | 'missing' | 'ready';
  thumbnailUrl: string | null;
}

/** Processing takes priority; only a saved thumbnail on enabled storage grants a link. */
export function thumbnailPresentation(image: {
  imageId: string;
  processingStatus: (typeof mediaImages.$inferSelect)['processingStatus'];
  storageEnabled: boolean;
  hasThumbnail: boolean;
}): ThumbnailPresentation {
  let status: ThumbnailPresentation['status'];
  if (
    image.processingStatus === 'pending' ||
    image.processingStatus === 'processing'
  )
    status = 'processing';
  else if (image.processingStatus === 'failed') status = 'failed';
  else if (!image.storageEnabled) status = 'disabled';
  else if (!image.hasThumbnail) status = 'missing';
  else status = 'ready';
  return {
    status,
    thumbnailUrl:
      status === 'ready' ? buildImagePath(image.imageId, 'thumbnail') : null,
  };
}
