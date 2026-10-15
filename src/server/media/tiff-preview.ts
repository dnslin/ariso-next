import type { startPreviewRuntime } from './previews.ts';
import type { MediaRuntime } from './process.ts';
import { previewError } from './preview-state.ts';
import { readMediaObject } from './storage.ts';
import {
  canPreviewTiff,
  tiffPreviewDownloadRequired,
} from './tiff-preview-policy.ts';
import { selectImageDelivery } from '../delivery/access.ts';
import { deliveryError } from '../delivery/errors.ts';
import { parseImageRequest } from '../delivery/links.ts';

/** Owner-only presentation; published originals and their download links remain untouched. */
export async function prepareTiffPreview(
  request: Request,
  imageId: string,
  runtime: MediaRuntime,
  previews: ReturnType<typeof startPreviewRuntime>,
) {
  parseImageRequest(imageId, new URLSearchParams());
  const select = () =>
    selectImageDelivery(runtime.db, imageId, 'original', true);
  const original = select();
  if (original.version.mime !== 'image/tiff')
    throw previewError('TIFF_PREVIEW_UNSUPPORTED', '该图片不是 TIFF 格式', 422);
  if (!canPreviewTiff(original.version.byteSize))
    throw previewError(
      'TIFF_PREVIEW_DOWNLOAD_REQUIRED',
      tiffPreviewDownloadRequired,
      413,
    );
  const id = `tiff-${original.object.id}`;
  await previews.receiveStored(
    id,
    async (signal) => {
      const current = select();
      if (current.object.id !== original.object.id)
        throw deliveryError('IMAGE_CHANGED');
      return (
        await readMediaObject(
          runtime,
          current.storage,
          current.object.key,
          current.version.mime,
          signal,
        )
      ).stream;
    },
    original.version.byteSize,
  );
  const response = await previews.waitForResult(id, request.signal);
  try {
    if (select().object.id !== original.object.id)
      throw deliveryError('IMAGE_CHANGED');
    return response;
  } catch (error) {
    await response.body?.cancel();
    throw error;
  }
}
