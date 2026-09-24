import { statSync, statfsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';

export class MultipartReceiveError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MultipartReceiveError';
    this.code = code;
    this.status = status;
  }
}

const writes = new Set<{ device: number; remaining: number }>();
const bufferSize = 64 * 1024;

export async function receiveMultipart(
  request: Request,
  options: {
    path: string;
    maxBytes: number;
    declaredSize: number;
    signal: AbortSignal;
    onProgress?: (bytes: number) => void;
  },
): Promise<{ byteSize: number }> {
  const error = (
    code: string,
    status: number,
    message: string,
    cause?: unknown,
  ) =>
    new MultipartReceiveError(
      code,
      status,
      message,
      cause === undefined ? undefined : { cause },
    );
  if (!request.body)
    throw error('UPLOAD_MISSING_FILE', 400, 'Missing upload body');
  if (
    !/^multipart\/form-data(?:;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    throw error(
      'UPLOAD_INVALID_MULTIPART',
      400,
      'Expected multipart/form-data',
    );
  const lengthHeader = request.headers.get('content-length');
  const contentLength = lengthHeader === null ? null : Number(lengthHeader);
  if (
    lengthHeader !== null &&
    (!/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(contentLength))
  )
    throw error('UPLOAD_INVALID_LENGTH', 400, 'Invalid Content-Length');
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({
      headers: Object.fromEntries(request.headers),
      highWaterMark: bufferSize,
      fileHwm: bufferSize,
      limits: { files: 1, fields: 0, fileSize: options.maxBytes + 1 },
    });
  } catch (cause) {
    throw error(
      'UPLOAD_INVALID_MULTIPART',
      400,
      'Invalid multipart boundary',
      cause,
    );
  }
  const controller = new AbortController();
  let failure: Error | undefined;
  const fail = (cause: Error) => {
    failure ??= cause;
    // Busboy can emit a limit while updating its current file stream.
    queueMicrotask(() => controller.abort(failure));
  };
  const abort = () =>
    fail(
      error(
        'UPLOAD_CANCELLED',
        400,
        'Upload reception cancelled',
        options.signal.aborted ? options.signal.reason : request.signal.reason,
      ),
    );
  options.signal.addEventListener('abort', abort, { once: true });
  request.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted || request.signal.aborted) abort();
  const idle = setTimeout(
    () =>
      fail(
        error(
          'UPLOAD_RECEIVE_TIMEOUT',
          408,
          'Upload made no progress for 120 seconds',
        ),
      ),
    120_000,
  );
  const total = setTimeout(
    () =>
      fail(
        error(
          'UPLOAD_RECEIVE_TIMEOUT',
          408,
          'Upload exceeded the 1800 second reception budget',
        ),
      ),
    1_800_000,
  );
  idle.unref();
  total.unref();
  let byteSize = 0;
  let bodyBytes = 0;
  let files = 0;
  const writers: Promise<void>[] = [];
  parser.on('filesLimit', () =>
    fail(error('UPLOAD_EXTRA_FILE', 400, 'Exactly one file is allowed')),
  );
  parser.on('fieldsLimit', () =>
    fail(
      error('UPLOAD_UNKNOWN_FIELD', 400, 'Multipart fields are not allowed'),
    ),
  );
  parser.on('file', (name, file) => {
    files++;
    file.on('error', (cause) => fail(cause));
    file.on('limit', () =>
      fail(error('UPLOAD_FILE_TOO_LARGE', 413, 'File exceeds upload limit')),
    );
    if (name !== 'file') {
      file.resume();
      fail(error('UPLOAD_UNKNOWN_FIELD', 400, 'Expected file field'));
      return;
    }
    const writer = (async () => {
      const directory = dirname(options.path);
      const write = {
        device: statSync(directory).dev,
        remaining: options.declaredSize,
      };
      writes.add(write);
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      let pendingWrite: Promise<void> | undefined;
      try {
        handle = await open(options.path, 'wx');
        await pipeline(
          file,
          new Writable({
            highWaterMark: bufferSize,
            write(chunk: Buffer, _encoding, callback) {
              pendingWrite = (async () => {
                controller.signal.throwIfAborted();
                if (byteSize + chunk.length > options.maxBytes)
                  throw error(
                    'UPLOAD_FILE_TOO_LARGE',
                    413,
                    'File exceeds upload limit',
                  );
                if (byteSize + chunk.length > options.declaredSize)
                  throw error(
                    'UPLOAD_SIZE_MISMATCH',
                    400,
                    'File exceeds declared size',
                  );
                const fs = statfsSync(directory);
                const needed = [...writes]
                  .filter((entry) => entry.device === write.device)
                  .reduce((sum, entry) => sum + entry.remaining, 0);
                if (fs.bavail * fs.bsize < needed)
                  throw error(
                    'UPLOAD_INSUFFICIENT_SPACE',
                    507,
                    `Insufficient disk space at ${directory}`,
                  );
                let offset = 0;
                while (offset < chunk.length) {
                  controller.signal.throwIfAborted();
                  const result = await handle!.write(
                    chunk,
                    offset,
                    chunk.length - offset,
                  );
                  if (!result.bytesWritten)
                    throw new Error(`No write progress at ${options.path}`);
                  offset += result.bytesWritten;
                  write.remaining -= result.bytesWritten;
                }
                byteSize += chunk.length;
                idle.refresh();
                options.onProgress?.(byteSize);
              })();
              void pendingWrite.then(
                () => callback(),
                (cause: Error) => callback(cause),
              );
            },
          }),
          { signal: controller.signal },
        );
        if ((await handle.stat()).size !== byteSize)
          throw error(
            'UPLOAD_SIZE_MISMATCH',
            400,
            'Actual file size differs from received bytes',
          );
      } finally {
        // Destroying a Writable does not await its asynchronous write callback.
        // Settle that callback before closing the file or releasing responsibility.
        await pendingWrite?.catch((cause: Error) => fail(cause));
        try {
          await handle?.close();
        } finally {
          writes.delete(write);
        }
      }
    })().catch((cause: Error) => {
      fail(cause);
    });
    writers.push(writer);
  });
  try {
    await pipeline(
      Readable.fromWeb(
        request.body as import('node:stream/web').ReadableStream<Uint8Array>,
      ),
      new Transform({
        highWaterMark: bufferSize,
        transform(chunk: Buffer, _encoding, callback) {
          bodyBytes += chunk.length;
          idle.refresh();
          if (contentLength !== null && bodyBytes > contentLength)
            callback(
              error('UPLOAD_SIZE_MISMATCH', 400, 'Body exceeds Content-Length'),
            );
          else callback(null, chunk);
        },
      }),
      parser,
      { signal: controller.signal },
    ).catch((cause: Error) => fail(cause));
    await Promise.all(writers);
    if (failure) throw failure;
    if (files !== 1)
      throw error('UPLOAD_MISSING_FILE', 400, 'Exactly one file is required');
    if (!byteSize)
      throw error('UPLOAD_EMPTY_FILE', 400, 'Empty file is not allowed');
    if (
      byteSize !== options.declaredSize ||
      (contentLength !== null && contentLength !== bodyBytes)
    )
      throw error(
        'UPLOAD_SIZE_MISMATCH',
        400,
        'Received size differs from declared size',
      );
    return { byteSize };
  } catch (cause) {
    if (cause instanceof MultipartReceiveError) throw cause;
    if ((cause as NodeJS.ErrnoException).code === 'ENOSPC')
      throw error(
        'UPLOAD_INSUFFICIENT_SPACE',
        507,
        `Disk full at ${options.path}`,
        cause,
      );
    throw error(
      'UPLOAD_RECEIVE_FAILED',
      400,
      'Upload stream failed or multipart body was truncated',
      cause,
    );
  } finally {
    clearTimeout(idle);
    clearTimeout(total);
    options.signal.removeEventListener('abort', abort);
    request.signal.removeEventListener('abort', abort);
  }
}
