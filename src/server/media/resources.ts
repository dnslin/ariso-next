import { readdirSync, statfsSync, statSync } from 'node:fs';
import { sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { finished } from 'node:stream/promises';

const MiB = 1024 * 1024;
const lowWaterBytes = 256 * MiB;
const maxCacheBytes = 512 * MiB;

type KnownWrite = { id: string; path: string; remainingBytes: number };
type Cache = { directory: string; device: number; limit: number };

function filesystem(path: string) {
  const info = statfsSync(path);
  return { device: statSync(path).dev, free: info.bavail * info.bsize };
}

function allocatedBytes(directory: string): number {
  let bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // Runtime directories are absolute; do not turn this into a build-time glob.
    const path = `${directory}${sep}${entry.name}`;
    try {
      bytes += entry.isDirectory()
        ? allocatedBytes(path)
        : statSync(path).blocks * 512;
    } catch (error) {
      // ImageMagick can unlink a cache between the directory listing and stat.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return bytes;
}

function insufficientSpace(path: string, available: number, needed: number) {
  return Object.assign(
    new Error(
      `Insufficient disk space at ${path}: ${available} bytes above low-water, ${needed} bytes needed`,
    ),
    {
      code: 'INSUFFICIENT_DISK_SPACE',
      path,
      availableBytes: available,
      neededBytes: needed,
    },
  );
}

/** One instance belongs to the single-process media runtime. No files are preallocated. */
export function createMediaResources() {
  const writes = new Map<string, KnownWrite>();
  const caches = new Set<Cache>();

  function available(path: string, exceptWrite?: string) {
    const { device, free } = filesystem(path);
    let remaining = free - lowWaterBytes;
    for (const write of writes.values()) {
      if (write.id !== exceptWrite && filesystem(write.path).device === device)
        remaining -= write.remainingBytes;
    }
    return { device, remaining };
  }

  function requireSpace(path: string, bytes = 0) {
    const { remaining } = available(path);
    if (remaining < bytes) throw insufficientSpace(path, remaining, bytes);
    return remaining;
  }

  return {
    /** The owning upload/download operation persists its remaining bytes before recovery. */
    restoreWrites(records: KnownWrite[]) {
      for (const record of records) writes.set(record.id, { ...record });
    },
    reserveWrite(id: string, path: string, remainingBytes: number) {
      const { remaining } = available(path, id);
      if (remaining < remainingBytes)
        throw insufficientSpace(path, remaining, remainingBytes);
      writes.set(id, { id, path, remainingBytes });
    },
    consumeWrite(id: string, writtenBytes: number) {
      const write = writes.get(id);
      if (write)
        write.remainingBytes = Math.max(0, write.remainingBytes - writtenBytes);
    },
    releaseWrite(id: string) {
      writes.delete(id);
    },
    beginStep({
      temporaryDirectory,
      storageDirectory,
    }: {
      temporaryDirectory: string;
      storageDirectory: string;
    }) {
      // Both directories already exist. stat.dev merges paths on the same filesystem.
      requireSpace(storageDirectory);
      const { device, remaining } = available(temporaryDirectory);
      if (remaining < 0)
        throw insufficientSpace(temporaryDirectory, remaining, 0);
      let cacheBudget = remaining;
      for (const active of caches) {
        if (active.device === device)
          cacheBudget -= Math.max(
            0,
            active.limit - allocatedBytes(active.directory),
          );
      }
      const cache: Cache = {
        directory: temporaryDirectory,
        device,
        limit: Math.min(maxCacheBytes, Math.max(0, cacheBudget)),
      };
      const controller = new AbortController();
      let outputBytes = 0;
      let closed = false;
      caches.add(cache);
      function check() {
        controller.signal.throwIfAborted();
        try {
          // Unused cache allowances are not disk reservations. Admission and writes
          // use actual free space and only known remaining transfer bytes.
          requireSpace(temporaryDirectory);
          requireSpace(storageDirectory);
          const allocated = allocatedBytes(temporaryDirectory);
          if (allocated > cache.limit)
            throw Object.assign(
              new Error(
                `Image cache exceeded ${cache.limit} bytes at ${temporaryDirectory}: ${allocated}`,
              ),
              { code: 'MEDIA_RESOURCE_LIMIT' },
            );
        } catch (error) {
          controller.abort(error);
          throw error;
        }
      }
      const timer = setInterval(() => {
        try {
          check();
        } catch {
          /* The abort reason is consumed by the active tool/stream. */
        }
      }, 100);
      timer.unref();
      return {
        diskLimitBytes: cache.limit,
        signal: controller.signal,
        get outputBytes() {
          return outputBytes;
        },
        check,
        countOutput(source: Readable) {
          const output = new Transform({
            highWaterMark: 64 * 1024,
            transform(chunk: Buffer, _encoding, callback) {
              try {
                check();
                requireSpace(storageDirectory, chunk.length);
                outputBytes += chunk.length;
                callback(null, chunk);
              } catch (error) {
                controller.abort(error);
                callback(error as Error);
              }
            },
          });
          // Closing or cancelling downstream also releases a tool blocked on stdout.
          output.once('close', () => source.destroy());
          void finished(source, { cleanup: true }).catch((error: Error) => {
            output.destroy(error);
          });
          const abort = () => output.destroy(controller.signal.reason);
          controller.signal.addEventListener('abort', abort, { once: true });
          output.once('close', () =>
            controller.signal.removeEventListener('abort', abort),
          );
          if (controller.signal.aborted) abort();
          source.pipe(output);
          return output;
        },
        /** Call after the tool/stream has settled; the caller then removes its own task directory. */
        close() {
          if (closed) return;
          closed = true;
          clearInterval(timer);
          caches.delete(cache);
        },
      };
    },
  };
}
