import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { makeHeaders } from '../delivery/headers.ts';
import { responseStream } from '../delivery/stream.ts';
import type { MediaRuntime } from '../media/process.ts';
import { inspectMediaObject, readMediaObject } from '../media/storage.ts';
import { SharingError } from './errors.ts';
import { shareResponseHeaders } from './http.ts';
import { selectImageShareDelivery } from './image-configuration.ts';

type Options = MediaRuntime & { now?: () => Date };

export function imageShareFailure(request: Request, error: unknown) {
  const known =
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SHARING_') &&
    'status' in error &&
    typeof error.status === 'number';
  const missing =
    error instanceof Error &&
    'code' in error &&
    error.code === 'STORAGE_OBJECT_MISSING';
  return new Response(
    request.method === 'HEAD'
      ? null
      : JSON.stringify({
          code: known ? error.code : 'SHARING_IMAGE_UNAVAILABLE',
          message: known ? error.message : '图片暂时无法读取，请稍后重试',
        }),
    {
      status: known ? (error.status as number) : missing ? 404 : 500,
      headers: {
        ...shareResponseHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
async function close(source: Readable) {
  source.destroy();
  await finished(source, { cleanup: true }).catch(() => undefined);
}
function cancelled(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted &&
    (error === signal.reason ||
      (error instanceof Error &&
        error.name === 'AbortError' &&
        'cause' in error &&
        error.cause === signal.reason))
  );
}

/** Token-scoped private bytes always pass through Ariso, including S3. No owner impersonation. */
export async function prepareImageShareDelivery(
  request: Request,
  token: string,
  options: Options,
) {
  let source: Readable | undefined;
  let imageId: string | undefined;
  try {
    if (
      new URL(request.url).search ||
      !['GET', 'HEAD'].includes(request.method)
    )
      throw new SharingError(
        'SHARING_INVALID_INPUT',
        '图片分享不接受额外参数或其他请求方法',
      );
    const select = () =>
      selectImageShareDelivery(
        options.db,
        token,
        options.now?.() ?? new Date(),
      );
    request.signal.throwIfAborted();
    const selected = select();
    imageId = selected.image.id;
    if (request.method === 'HEAD') {
      const inspected = await inspectMediaObject(
        options,
        selected.storage,
        selected.object.key,
        request.signal,
      );
      if (!inspected)
        throw Object.assign(new Error('Shared image object missing'), {
          code: 'STORAGE_OBJECT_MISSING',
        });
      if (inspected.size !== selected.version.byteSize)
        throw new Error(
          `Shared image size mismatch: ${imageId}, actual=${inspected.size}, expected=${selected.version.byteSize}`,
        );
    } else {
      const opened = await readMediaObject(
        options,
        selected.storage,
        selected.object.key,
        selected.version.mime,
        request.signal,
      );
      source = opened.stream;
      source.on('error', (err) => {
        if (!cancelled(err, request.signal))
          options.logger.error(
            { err, imageId, objectId: selected.object.id },
            'Shared image stream failed',
          );
      });
    }
    request.signal.throwIfAborted();
    const current = select();
    if (
      selected.object.id !== current.object.id ||
      selected.storage.configRevision !== current.storage.configRevision
    )
      throw new SharingError(
        'SHARING_IMAGE_CHANGED',
        '图片内容已改变，请重新打开分享',
        409,
      );
    const headers = makeHeaders({
      imageId: 'shared-image',
      objectId: current.object.id,
      size: current.version.byteSize,
      contentType: current.version.mime,
      extension: current.version.format,
      displayName: 'image',
      download: false,
      actualVersion: current.share.sourceVersion,
    });
    for (const [name, value] of Object.entries(shareResponseHeaders))
      headers.set(name, value);
    if (request.method === 'HEAD') return new Response(null, { headers });
    const body = responseStream(
      source!,
      request.signal,
      () => undefined,
      (err) =>
        options.logger.error({ err, imageId }, 'Shared image response failed'),
    );
    return new Response(body, { headers });
  } catch (error) {
    if (source) await close(source);
    if (!cancelled(error, request.signal) && !(error instanceof SharingError))
      options.logger.error(
        { err: error, imageId },
        'Shared image delivery failed',
      );
    return imageShareFailure(request, error);
  }
}
