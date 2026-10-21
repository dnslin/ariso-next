import type { ImageSizeState } from '../media/size-types.ts';
import type { buildImageLinks } from './links.ts';
export type ImageSizeResponse = ImageSizeState & {
  links: ReturnType<typeof buildImageLinks> | null;
};
