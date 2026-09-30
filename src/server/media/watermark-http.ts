import { mediaError } from './errors.ts';
import { WATERMARK_MAX_BYTES } from './watermark-validation.ts';

/** Bound the multipart envelope before the native parser buffers it. File bytes have a separate 5 MiB limit. */
export async function readWatermarkUpload(
  request: Request,
  signal: AbortSignal,
) {
  const invalid = (message: string, status = 400) =>
    Object.assign(mediaError('MEDIA_WATERMARK_REQUEST', message), { status });
  if (
    !request.body ||
    !/^multipart\/form-data(?:;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    throw invalid('请使用 multipart/form-data 上传一个 file');
  const reader = request.body.getReader();
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > WATERMARK_MAX_BYTES + 64 * 1024) {
        await reader.cancel();
        throw invalid('上传请求超过水印素材及表单大小限制', 413);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
  } catch (cause) {
    throw Object.assign(
      mediaError('MEDIA_WATERMARK_REQUEST', '无效的 multipart 表单', cause),
      { status: 400 },
    );
  }
  const entries = [...form.entries()];
  if (
    entries.length !== 1 ||
    entries[0][0] !== 'file' ||
    typeof entries[0][1] === 'string'
  )
    throw invalid('仅允许一个 file 文件，不接受其他字段');
  const file = entries[0][1];
  if (!file.size || file.size > WATERMARK_MAX_BYTES)
    throw invalid('水印素材必须非空且不超过 5 MiB', file.size ? 413 : 400);
  return Buffer.from(await file.arrayBuffer());
}
