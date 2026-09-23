import type { ReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import type { VersionKind } from '../media/schema.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { readObject } from '../storage/local.ts';
import { deliveryError, selectImageDelivery } from './access.ts';
import { makeHeaders, preconditionStatus } from './headers.ts';
import { parseImageRequest } from './links.ts';
import { responseStream } from './stream.ts';

export type ImageAccessEvent = {
  imageId: string;
  storageId: string;
  actualVersion: VersionKind;
  occurredAt: Date;
};
type DeliveryOptions = {
  db: BetterSQLite3Database;
  storageRoot: string;
  readOwner: () => Promise<boolean>;
  // T-ANA-01 supplies the synchronous in-memory consumer at the route boundary.
  onAccess?: (event: ImageAccessEvent) => void;
  logger?: Pick<Logger, 'error'>;
};
export const deliveryHeaders = {
  'Cache-Control': 'private, no-store, no-transform',
  'X-Content-Type-Options': 'nosniff',
};
const errors = {
  INVALID_IMAGE_REQUEST: [400, '图片请求参数无效'],
  OWNER_LOGIN_REQUIRED: [401, '请登录后访问私有图片'],
  IMAGE_NOT_FOUND: [404, '图片不存在'],
  IMAGE_UNAVAILABLE: [404, '图片已回收或正在删除'],
  VERSION_UNAVAILABLE: [404, '请求的图片版本不可用'],
  IMAGE_NOT_READY: [409, '图片尚未处理完成'],
  STORAGE_DISABLED: [409, '图片所属存储已停用'],
  IMAGE_CHANGED: [409, '图片版本发生变化，请重试'],
  STORAGE_OBJECT_MISSING: [404, '图片文件不存在'],
  PRECONDITION_FAILED: [412, '图片请求前提条件不满足'],
  DELIVERY_FAILED: [500, '图片读取失败，请稍后重试'],
} as const;

export function imageFailure(request: Request, code: keyof typeof errors) {
  const [status, message] = errors[code];
  return new Response(
    request.method === 'HEAD' ? null : JSON.stringify({ code, message }),
    {
      status,
      headers: {
        ...deliveryHeaders,
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
}

async function close(source: ReadStream) {
  source.destroy();
  // Disposal may repeat the original stream failure; that failure is logged separately.
  await finished(source, { cleanup: true }).catch(() => undefined);
}
type Selection = ReturnType<typeof selectImageDelivery>;
function sameTarget(a: Selection, b: Selection) {
  return a.object.id === b.object.id && a.actualVersion === b.actualVersion;
}

export async function prepareImageDelivery(
  request: Request,
  imageId: string,
  options: DeliveryOptions,
) {
  const logger = options.logger ?? createRuntimeLogger('delivery', 'info');
  let source: ReadStream | undefined;
  try {
    const input = parseImageRequest(imageId, new URL(request.url).searchParams);
    const select = (owner: boolean) =>
      selectImageDelivery(options.db, imageId, input.selectedVersion, owner);
    for (let attempt = 0; attempt < 2; attempt++) {
      request.signal.throwIfAborted();
      const selected = select(await options.readOwner());
      let opened;
      try {
        opened = await readObject(
          options.storageRoot,
          selected.storage,
          selected.object.key,
          selected.version.mime,
          request.signal,
        );
      } catch (error) {
        if ((error as { code?: string }).code !== 'STORAGE_OBJECT_MISSING')
          throw error;
        // Old published objects can be removed after media atomically replaces a version.
        const current = select(await options.readOwner());
        if (sameTarget(selected, current)) throw error;
        if (attempt === 1)
          throw deliveryError(409, 'IMAGE_CHANGED', '图片版本连续变化');
        continue;
      }
      source = opened.stream;
      source.on('error', (err) =>
        logger.error(
          { err, imageId, objectId: selected.object.id },
          'Image file stream failed',
        ),
      );
      if (
        opened.size !== selected.version.byteSize ||
        opened.size !== selected.object.byteSize
      )
        throw new Error(
          `Image object size mismatch: ${selected.object.id}, actual=${opened.size}, version=${selected.version.byteSize}, object=${selected.object.byteSize}`,
        );
      const owner = await options.readOwner();
      request.signal.throwIfAborted();
      const current = select(owner);
      if (!sameTarget(selected, current)) {
        await close(source);
        source = undefined;
        if (attempt === 1)
          throw deliveryError(409, 'IMAGE_CHANGED', '图片版本连续变化');
        continue;
      }
      const headers = makeHeaders({
        imageId,
        objectId: current.object.id,
        size: opened.size,
        contentType: current.version.mime,
        extension: current.version.format,
        displayName: current.image.displayName,
        download: input.download,
        actualVersion: current.actualVersion,
      });
      const status = preconditionStatus(request, headers.get('etag')!);
      if (status !== 200 || request.method === 'HEAD') {
        await close(source);
        source = undefined;
        return status === 412
          ? imageFailure(request, 'PRECONDITION_FAILED')
          : new Response(null, { status, headers });
      }
      const body = responseStream(
        source,
        request.signal,
        () => {
          if (
            !owner &&
            current.image.visibility === 'public' &&
            current.image.processingStatus === 'ready' &&
            current.actualVersion !== 'thumbnail'
          ) {
            options.onAccess?.({
              imageId,
              storageId: current.storage.id,
              actualVersion: current.actualVersion,
              occurredAt: new Date(),
            });
          }
        },
        (err) =>
          logger.error(
            { err, imageId, objectId: current.object.id },
            'Image delivery stream or access consumer failed',
          ),
      );
      return new Response(body, { headers });
    }
    throw new Error('Image selection exhausted');
  } catch (err) {
    if (source) await close(source);
    const code = (err as { code?: string } | null)?.code;
    if (
      !code ||
      !Object.hasOwn(errors, code) ||
      code === 'STORAGE_OBJECT_MISSING'
    )
      logger.error({ err, imageId }, 'Image delivery failed');
    return imageFailure(
      request,
      code && Object.hasOwn(errors, code)
        ? (code as keyof typeof errors)
        : 'DELIVERY_FAILED',
    );
  }
}
