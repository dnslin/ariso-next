import Uppy from '@uppy/core';
import XHRUpload from '@uppy/xhr-upload';
import type {
  CreateUploadTransport,
  UploadSessionResult,
  UploadSubmissionResult,
} from './types.ts';
import type { beginSession } from '../../server/upload/s3.ts';

type Begin = Awaited<ReturnType<typeof beginSession>>;
/** Both raw S3 PUT and multipart relay use the installed XHR plugin and one queue slot. */
export const createUploadTransport: CreateUploadTransport = (file, id) => {
  const abort = new AbortController();
  const uppy = new Uppy<Record<string, unknown>, Record<string, unknown>>({
    autoProceed: false,
    onBeforeFileAdded: (candidate) => ({ ...candidate, id }),
  });
  uppy.addFile({ name: file.name, type: file.type, data: file });
  async function post<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
      cache: 'no-store',
      signal: abort.signal,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message ?? `请求失败（${response.status}）`);
    return result;
  }
  async function fail(endpoint: string): Promise<UploadSessionResult> {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'transfer-failed' }),
      cache: 'no-store',
      signal: abort.signal,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message ?? '传输终止结果尚未确认，请核对或取消');
    return result;
  }
  return {
    async upload(sessionId, onProgress, onRoute, onResubmit) {
      let endpoint = `/api/uploads/sessions/${encodeURIComponent(sessionId)}`;
      let begin = await post<Begin>(`${endpoint}/begin`);
      let signed = 'upload' in begin ? begin.upload : undefined;
      while (signed && Date.parse(signed.expiresAt) - Date.now() <= 10_000) {
        const requestId = crypto.randomUUID();
        const pending = post<UploadSubmissionResult>(`${endpoint}/resubmit`, {
          requestId,
        });
        await onResubmit(requestId, sessionId, pending);
        abort.signal.throwIfAborted();
        const submission = await pending;
        sessionId = submission.sessions[0].id;
        endpoint = `/api/uploads/sessions/${encodeURIComponent(sessionId)}`;
        begin = await post<Begin>(`${endpoint}/begin`);
        signed = 'upload' in begin ? begin.upload : undefined;
      }
      abort.signal.throwIfAborted();
      onRoute(begin.route, begin.reason);
      uppy.use(XHRUpload, {
        endpoint: signed ? signed.url : `${endpoint}/content`,
        method: signed ? 'PUT' : 'POST',
        formData: !signed,
        headers: signed ? signed.headers : {},
        ...(signed ? { getResponseData: () => ({}) } : {}),
        fieldName: 'file',
        allowedMetaFields: false,
        bundle: false,
        limit: 1,
        timeout: 0,
        shouldRetry: () => false,
      });
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let totalTimer: ReturnType<typeof setTimeout> | undefined;
      let transferred = 0;
      let rejectLimit: (error: Error) => void;
      const limit = new Promise<never>((_resolve, reject) => {
        rejectLimit = reject;
      });
      const armIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () => rejectLimit(new Error('直传连续 120 秒没有进展')),
          120_000,
        );
      };
      const cancelled = () =>
        rejectLimit(new DOMException('Aborted', 'AbortError'));
      abort.signal.addEventListener('abort', cancelled, { once: true });
      if (signed) {
        armIdle();
        totalTimer = setTimeout(
          () => rejectLimit(new Error('直传超过 30 分钟')),
          1_800_000,
        );
      }
      uppy.on('upload-progress', (_file, progress) => {
        if (signed && progress.bytesUploaded > transferred) {
          transferred = progress.bytesUploaded;
          armIdle();
        }
        if (progress.bytesTotal)
          onProgress(
            Math.min(
              100,
              Math.floor((progress.bytesUploaded / progress.bytesTotal) * 100),
            ),
          );
      });
      let result;
      try {
        result = await Promise.race([uppy.upload(), limit]);
      } catch (error) {
        if (!signed || abort.signal.aborted) throw error;
        uppy.cancelAll();
        return fail(endpoint);
      } finally {
        clearTimeout(idleTimer);
        clearTimeout(totalTimer);
        abort.signal.removeEventListener('abort', cancelled);
      }
      abort.signal.throwIfAborted();
      if (!result?.successful?.length) {
        if (signed) return fail(endpoint);
        throw new Error(
          result?.failed?.[0]?.error ?? '文件传输中断，请核对上传结果',
        );
      }
      return signed
        ? post<UploadSessionResult>(`${endpoint}/complete`)
        : (result.successful[0].response!.body! as UploadSessionResult);
    },
    destroy() {
      abort.abort();
      uppy.destroy();
    },
  };
};
