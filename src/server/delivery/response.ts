import type { ReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Logger } from 'pino';
import type { VersionKind } from '../media/schema.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { readObject } from '../storage/local.ts';
import { selectImageDelivery } from './access.ts';
import {
  deliveryErrors,
  deliveryError,
  isDeliveryErrorCode,
  type DeliveryErrorCode,
} from './errors.ts';
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
  access?: 'published' | 'trash-preview';
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
export function imageFailure(request: Request, code: DeliveryErrorCode) {
  const [status, message] = deliveryErrors[code];
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
      selectImageDelivery(
        options.db,
        imageId,
        input.selectedVersion,
        owner,
        options.access,
      );
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
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'STORAGE_OBJECT_MISSING'
        ))
          throw error;
        // Old published objects can be removed after media atomically replaces a version.
        const current = select(await options.readOwner());
        if (sameTarget(selected, current)) throw error;
        if (attempt === 1) throw deliveryError('IMAGE_CHANGED');
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
        if (attempt === 1) throw deliveryError('IMAGE_CHANGED');
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
    const code = err instanceof Error && 'code' in err ? err.code : undefined;
    const recognized = isDeliveryErrorCode(code);
    if (!recognized || code === 'STORAGE_OBJECT_MISSING')
      logger.error({ err, imageId }, 'Image delivery failed');
    return imageFailure(request, recognized ? code : 'DELIVERY_FAILED');
  }
}
