import { requireEditSource } from './edit-requests.ts';
import { MediaReprocessError } from './reprocess.ts';
import type { MediaRuntime } from './process.ts';

/** The browser and renderer refer to one exact current original, never a default derivative. */
export function readEditSource(
  runtime: MediaRuntime,
  imageId: string,
  sourceObjectId: string,
) {
  const { image, original, storage } = requireEditSource(runtime.db, imageId);
  if (original.id !== sourceObjectId)
    throw new MediaReprocessError(
      'MEDIA_EDIT_SOURCE_CHANGED',
      409,
      '原图已变化，请重新打开编辑器',
    );
  return { image, object: original, storage };
}
