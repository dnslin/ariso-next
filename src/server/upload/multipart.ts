import type { createMediaResources } from '../media/resources.ts';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import { writeReceivedFile } from '../media/file-write.ts';
import { UploadError } from './errors.ts';

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

const bufferSize = 64 * 1024;

export async function receiveMultipart(
  request: Request,
  options: {
    path: string;
    resources: ReturnType<typeof createMediaResources>;
    maxBytes: number;
    declaredSize?: number;
    signal: AbortSignal;
    onProgress?: (bytes: number) => void;
    onField?: (name: string, value: string) => void;
    onFile?: (info: busboy.FileInfo) => void;
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
  const diskFailure = (cause: Error) => {
    if (cause instanceof MultipartReceiveError) return cause;
    const code = (cause as NodeJS.ErrnoException).code;
    return code === 'ENOSPC' || code === 'INSUFFICIENT_DISK_SPACE'
      ? error(
          'UPLOAD_INSUFFICIENT_SPACE',
          507,
          code === 'ENOSPC'
            ? `Disk full at ${options.path}`
            : `Insufficient disk space at ${options.path}: ${cause.message}`,
          cause,
        )
      : error(
          'UPLOAD_RECEIVE_FAILED',
          500,
          `File reception failed at ${options.path}: ${cause.message}`,
          cause,
        );
  };
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
      ...(options.onField && { defParamCharset: 'utf8', preservePath: true }),
      limits: {
        files: 1,
        fields: options.onField ? Infinity : 0,
        fieldSize: 256 * 1024,
        fileSize: options.maxBytes + 1,
      },
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
  let fieldBytes = 0;
  parser.on('field', (name, value, info) => {
    try {
      fieldBytes += Buffer.byteLength(name) + Buffer.byteLength(value);
      if (info.nameTruncated || info.valueTruncated || fieldBytes > 256 * 1024)
        throw error(
          'UPLOAD_FIELDS_TOO_LARGE',
          400,
          'Multipart fields exceed 256 KiB',
        );
      options.onField?.(name, value);
    } catch (cause) {
      fail(cause as Error);
    }
  });
  parser.on('filesLimit', () =>
    fail(error('UPLOAD_EXTRA_FILE', 400, 'Exactly one file is allowed')),
  );
  parser.on('fieldsLimit', () =>
    fail(
      error('UPLOAD_UNKNOWN_FIELD', 400, 'Multipart fields are not allowed'),
    ),
  );
  parser.on('file', (name, file, info) => {
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
    try {
      options.onFile?.(info);
    } catch (cause) {
      file.resume();
      fail(cause as Error);
      return;
    }
    const writer = writeReceivedFile(file, {
      path: options.path,
      resources: options.resources,
      maxBytes: options.maxBytes,
      declaredSize: options.declaredSize,
      signal: controller.signal,
      sizeError(reason) {
        if (reason === 'limit')
          return error(
            'UPLOAD_FILE_TOO_LARGE',
            413,
            'File exceeds upload limit',
          );
        if (reason === 'declared')
          return error(
            'UPLOAD_SIZE_MISMATCH',
            400,
            'File exceeds declared size',
          );
        return error(
          'UPLOAD_SIZE_MISMATCH',
          400,
          'Actual file size differs from received bytes',
        );
      },
      mapError: diskFailure,
      onFailure: fail,
      onProgress(bytes) {
        byteSize = bytes;
        idle.refresh();
        options.onProgress?.(bytes);
      },
    }).then(
      () => undefined,
      (cause: Error) => fail(diskFailure(cause)),
    );
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
      (options.declaredSize !== undefined &&
        byteSize !== options.declaredSize) ||
      (contentLength !== null && contentLength !== bodyBytes)
    )
      throw error(
        'UPLOAD_SIZE_MISMATCH',
        400,
        'Received size differs from declared size',
      );
    return { byteSize };
  } catch (cause) {
    if (cause instanceof MultipartReceiveError || cause instanceof UploadError)
      throw cause;
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
