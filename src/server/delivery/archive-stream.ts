import type { Readable } from 'node:stream';
import ZipStream from 'zip-stream';
import type { Logger } from 'pino';
import type { ArchiveRequest } from '../library/archive-types.ts';
import { deliveryError } from './errors.ts';
import { sameSignedTarget } from './s3.ts';
import {
  closeArchiveSource,
  openArchiveObject,
  selectArchiveTarget,
  type ArchiveStorage,
  type ArchiveTarget,
} from './archive-selection.ts';

export function streamArchive(
  options: ArchiveStorage & { logger: Pick<Logger, 'error'> },
  input: ArchiveRequest,
  targets: ArchiveTarget[],
  request: Request,
  readOwner: () => Promise<void>,
) {
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const zip = new ZipStream({ store: true });
  const iterator = zip[Symbol.asyncIterator]();
  let source: Readable | undefined;
  let producing: Promise<void> | undefined;
  let completed = false;
  const closed = new Promise<void>((resolve) => zip.once('close', resolve));
  function stop() {
    controller.abort();
    source?.destroy();
    zip.destroy();
  }
  const abort = () => {
    source?.destroy();
    zip.destroy(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  zip.on('error', () => undefined); // The iterator reports the same failure to the HTTP body.
  void closed.then(() => signal.removeEventListener('abort', abort));

  function append(stream: Readable, filename: string) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        signal.removeEventListener('abort', cancelled);
        zip.removeListener('error', failed);
        if (error) reject(error);
        else resolve();
      };
      const cancelled = () => finish(signal.reason);
      const failed = (error: Error) => finish(error);
      signal.addEventListener('abort', cancelled, { once: true });
      zip.once('error', failed);
      try {
        zip.entry(stream, { name: filename }, (error) => finish(error));
      } catch (error) {
        finish(error);
      }
      if (signal.aborted) cancelled();
    });
  }

  async function produce() {
    let imageId: string | undefined;
    try {
      for (const target of targets) {
        imageId = target.image.id;
        signal.throwIfAborted();
        await readOwner();
        const current = selectArchiveTarget(options, input, imageId, new Set());
        if (!sameSignedTarget(target, current))
          throw deliveryError('IMAGE_CHANGED');
        const opened = await openArchiveObject(options, target, signal);
        source = opened.stream;
        source.on('error', (error) => zip.destroy(error));
        await readOwner();
        signal.throwIfAborted();
        if (
          !sameSignedTarget(
            target,
            selectArchiveTarget(options, input, imageId, new Set()),
          )
        )
          throw deliveryError('IMAGE_CHANGED');
        if (opened.size !== target.version.byteSize)
          throw new Error(`Archive object size mismatch: ${target.object.id}`);
        await append(source, target.filename);
        await closeArchiveSource(source);
        source = undefined;
      }
      zip.finalize();
      completed = true;
    } catch (err) {
      if (!signal.aborted)
        options.logger.error({ err, imageId }, 'Archive stream failed');
      source?.destroy();
      zip.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  }

  const body = new ReadableStream<Uint8Array>(
    {
      async pull(output) {
        producing ??= produce();
        try {
          signal.throwIfAborted();
          const next = await iterator.next();
          if (next.done) {
            if (!completed) await producing;
            output.close();
          } else output.enqueue(next.value);
        } catch (error) {
          stop();
          output.error(error);
        }
      },
      async cancel() {
        stop();
        await producing;
        await closed;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, stop, closed };
}
