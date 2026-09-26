import Uppy from '@uppy/core';
import XHRUpload from '@uppy/xhr-upload';
import type { CreateUploadTransport, UploadSessionResult } from './types.ts';

/** Uppy owns the selected file; no retries can resend a consumed session. */
export const createUploadTransport: CreateUploadTransport = (file, id) => {
  const uppy = new Uppy<
    Record<string, unknown>,
    UploadSessionResult & Record<string, unknown>
  >({
    autoProceed: false,
    onBeforeFileAdded: (candidate) => ({ ...candidate, id }),
  });
  uppy.addFile({ name: file.name, type: file.type, data: file });
  return {
    async upload(sessionId, onProgress) {
      uppy.use(XHRUpload, {
        endpoint: `/api/uploads/sessions/${encodeURIComponent(sessionId)}/content`,
        fieldName: 'file',
        allowedMetaFields: false,
        bundle: false,
        limit: 1,
        timeout: 0,
        shouldRetry: () => false,
      });
      uppy.on('upload-progress', (_file, progress) => {
        if (progress.bytesTotal)
          onProgress(
            Math.min(
              100,
              Math.floor((progress.bytesUploaded / progress.bytesTotal) * 100),
            ),
          );
      });
      const result = await uppy.upload();
      if (!result?.successful?.length)
        throw new Error(
          result?.failed?.[0]?.error ?? '文件传输中断，请核对上传结果',
        );
      return result.successful[0].response!.body!;
    },
    destroy() {
      uppy.destroy();
    },
  };
};
