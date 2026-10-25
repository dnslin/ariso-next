import { eq } from 'drizzle-orm';
import { resolveUploadStorage } from '../storage/defaults.ts';
import { readImageEditContext } from './edit-requests.ts';
import { MediaReprocessError } from './reprocess.ts';
import { mediaImages, mediaObjects } from './schema.ts';
import type { MediaRuntime } from './process.ts';

/** The browser and renderer refer to one exact current original, never a default derivative. */
export function readEditSource(
  runtime: MediaRuntime,
  imageId: string,
  sourceObjectId: string,
) {
  const context = readImageEditContext(runtime.db, imageId);
  if (context.unavailableReason)
    throw new MediaReprocessError(
      'MEDIA_EDIT_UNAVAILABLE',
      409,
      context.unavailableReason,
    );
  if (context.sourceObjectId !== sourceObjectId)
    throw new MediaReprocessError(
      'MEDIA_EDIT_SOURCE_CHANGED',
      409,
      '原图已变化，请重新打开编辑器',
    );
  const image = runtime.db
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, imageId))
    .get()!;
  const object = runtime.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, sourceObjectId))
    .get()!;
  return {
    image,
    object,
    storage: resolveUploadStorage(runtime.db, image.storageId),
  };
}
