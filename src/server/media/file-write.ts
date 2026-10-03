import type { createMediaResources } from './resources.ts';
import { open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function writeReceivedFile(
  file: Readable,
  options: {
    path: string;
    resources: ReturnType<typeof createMediaResources>;
    maxBytes: number;
    declaredSize?: number;
    signal: AbortSignal;
    sizeError: (reason: 'limit' | 'declared' | 'actual') => Error;
    mapError: (cause: Error) => Error;
    onFailure: (cause: Error) => void;
    onProgress: (bytes: number) => void;
  },
): Promise<number> {
  const directory = dirname(options.path);
  let byteSize = 0;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let pendingWrite: Promise<void> | undefined;
  try {
    handle = await open(options.path, 'wx');
    if (options.declaredSize !== undefined)
      options.resources.reserveWrite(
        options.path,
        directory,
        options.declaredSize,
      );
    await pipeline(
      file,
      new Writable({
        highWaterMark: 64 * 1024,
        write(chunk: Buffer, _encoding, callback) {
          pendingWrite = (async () => {
            options.signal.throwIfAborted();
            if (byteSize + chunk.length > options.maxBytes)
              throw options.sizeError('limit');
            if (
              options.declaredSize !== undefined &&
              byteSize + chunk.length > options.declaredSize
            )
              throw options.sizeError('declared');
            if (options.declaredSize === undefined)
              options.resources.reserveWrite(
                options.path,
                directory,
                chunk.length,
              );
            let offset = 0;
            while (offset < chunk.length) {
              options.signal.throwIfAborted();
              if (options.declaredSize !== undefined)
                options.resources.reserveWrite(
                  options.path,
                  directory,
                  options.declaredSize - byteSize - offset,
                );
              const result = await handle!.write(
                chunk,
                offset,
                chunk.length - offset,
              );
              if (!result.bytesWritten)
                throw new Error(`No write progress at ${options.path}`);
              offset += result.bytesWritten;
              options.resources.consumeWrite(options.path, result.bytesWritten);
            }
            byteSize += chunk.length;
            options.onProgress(byteSize);
          })().catch((cause: Error) => {
            throw options.mapError(cause);
          });
          void pendingWrite.then(
            () => callback(),
            (cause: Error) => callback(cause),
          );
        },
      }),
      { signal: options.signal },
    );
    if ((await handle.stat()).size !== byteSize)
      throw options.sizeError('actual');
    return byteSize;
  } finally {
    // Writable destruction does not await a native asynchronous write.
    // Settle it before closing the handle or releasing the disk reservation.
    await pendingWrite?.catch(options.onFailure);
    try {
      await handle?.close();
    } finally {
      if (handle) options.resources.releaseWrite(options.path);
    }
  }
}
