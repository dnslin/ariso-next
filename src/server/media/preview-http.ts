import type { createMediaResources } from '../media/resources.ts';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import { writeReceivedFile } from './file-write.ts';
import { ZodError, type z } from 'zod';
import { previewInputSchema } from './preview-validation.ts';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { analyzeMediaError } from './errors.ts';

export class PreviewReceiveError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PreviewReceiveError';
    this.code = code;
    this.status = status;
  }
}

const bufferSize = 64 * 1024;
const envelopeLimit = 64 * 1024;

export async function receivePreviewMultipart(
  request: Request,
  options: {
    path: string;
    resources: ReturnType<typeof createMediaResources>;
    maxBytes: number;
    signal: AbortSignal;
  },
): Promise<{ byteSize: number; input: z.infer<typeof previewInputSchema> }> {
  const error = (
    code: string,
    status: number,
    message: string,
    cause?: unknown,
  ) =>
    new PreviewReceiveError(
      code,
      status,
      message,
      cause === undefined ? undefined : { cause },
    );
  const diskFailure = (cause: Error) => {
    if (cause instanceof PreviewReceiveError) return cause;
    const code = (cause as NodeJS.ErrnoException).code;
    return code === 'ENOSPC' || code === 'INSUFFICIENT_DISK_SPACE'
      ? error(
          'MEDIA_PREVIEW_INSUFFICIENT_SPACE',
          507,
          code === 'ENOSPC'
            ? `Disk full at ${options.path}`
            : `Insufficient disk space at ${options.path}: ${cause.message}`,
          cause,
        )
      : error(
          'MEDIA_PREVIEW_RECEIVE_FAILED',
          500,
          `File reception failed at ${options.path}: ${cause.message}`,
          cause,
        );
  };
  if (!request.body)
    throw error('MEDIA_PREVIEW_MISSING_FILE', 400, 'Missing preview body');
  if (
    !/^multipart\/form-data(?:;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    throw error(
      'MEDIA_PREVIEW_INVALID_MULTIPART',
      400,
      'Expected multipart/form-data',
    );
  const lengthHeader = request.headers.get('content-length');
  const contentLength = lengthHeader === null ? null : Number(lengthHeader);
  if (
    lengthHeader !== null &&
    (!/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(contentLength))
  )
    throw error('MEDIA_PREVIEW_INVALID_LENGTH', 400, 'Invalid Content-Length');
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({
      headers: Object.fromEntries(request.headers),
      highWaterMark: bufferSize,
      fileHwm: bufferSize,
      limits: {
        files: 1,
        fields: 1,
        fieldSize: envelopeLimit,
        fileSize: options.maxBytes + 1,
      },
    });
  } catch (cause) {
    throw error(
      'MEDIA_PREVIEW_INVALID_MULTIPART',
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
        'MEDIA_PREVIEW_CANCELLED',
        400,
        'Preview reception cancelled',
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
          'MEDIA_PREVIEW_RECEIVE_TIMEOUT',
          408,
          'Preview made no progress for 120 seconds',
        ),
      ),
    120_000,
  );
  const total = setTimeout(
    () =>
      fail(
        error(
          'MEDIA_PREVIEW_RECEIVE_TIMEOUT',
          408,
          'Preview exceeded the 1800 second reception budget',
        ),
      ),
    1_800_000,
  );
  idle.unref();
  total.unref();
  let byteSize = 0;
  let bodyBytes = 0;
  let files = 0;
  let input: z.infer<typeof previewInputSchema> | undefined;
  const writers: Promise<void>[] = [];
  parser.on('filesLimit', () =>
    fail(error('MEDIA_PREVIEW_EXTRA_FILE', 400, 'Exactly one file is allowed')),
  );
  parser.on('fieldsLimit', () =>
    fail(
      error(
        'MEDIA_PREVIEW_REQUEST',
        400,
        'Exactly one options field is allowed',
      ),
    ),
  );
  parser.on('field', (name, value, info) => {
    if (name !== 'options') {
      fail(error('MEDIA_PREVIEW_REQUEST', 400, 'Expected options field'));
      return;
    }
    if (info.valueTruncated) {
      fail(
        error(
          'MEDIA_PREVIEW_REQUEST',
          413,
          'Options exceed the 64 KiB envelope limit',
        ),
      );
      return;
    }
    try {
      input = previewInputSchema.parse(JSON.parse(value));
    } catch (cause) {
      fail(cause as Error);
    }
  });
  parser.on('file', (name, file) => {
    files++;
    file.on('error', (cause) => fail(cause));
    file.on('limit', () =>
      fail(
        error(
          'MEDIA_PREVIEW_FILE_TOO_LARGE',
          413,
          'File exceeds preview limit',
        ),
      ),
    );
    if (name !== 'file') {
      file.resume();
      fail(error('MEDIA_PREVIEW_UNKNOWN_FIELD', 400, 'Expected file field'));
      return;
    }
    const writer = writeReceivedFile(file, {
      path: options.path,
      resources: options.resources,
      maxBytes: options.maxBytes,
      signal: controller.signal,
      sizeError(reason) {
        if (reason === 'limit')
          return error(
            'MEDIA_PREVIEW_FILE_TOO_LARGE',
            413,
            'File exceeds preview limit',
          );
        return error(
          'MEDIA_PREVIEW_SIZE_MISMATCH',
          400,
          'Actual file size differs from received bytes',
        );
      },
      mapError: diskFailure,
      onFailure: fail,
      onProgress(bytes) {
        byteSize = bytes;
        idle.refresh();
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
          if (bodyBytes > options.maxBytes + envelopeLimit)
            callback(
              error(
                'MEDIA_PREVIEW_FILE_TOO_LARGE',
                413,
                'Request exceeds file and envelope limits',
              ),
            );
          else if (contentLength !== null && bodyBytes > contentLength)
            callback(
              error(
                'MEDIA_PREVIEW_SIZE_MISMATCH',
                400,
                'Body exceeds Content-Length',
              ),
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
      throw error(
        'MEDIA_PREVIEW_MISSING_FILE',
        400,
        'Exactly one file is required',
      );
    if (!byteSize)
      throw error('MEDIA_PREVIEW_EMPTY_FILE', 400, 'Empty file is not allowed');
    if (!input)
      throw error(
        'MEDIA_PREVIEW_REQUEST',
        400,
        'Exactly one options field is required',
      );
    if (bodyBytes - byteSize > envelopeLimit)
      throw error(
        'MEDIA_PREVIEW_REQUEST',
        413,
        'Multipart envelope exceeds 64 KiB',
      );
    if (contentLength !== null && contentLength !== bodyBytes)
      throw error(
        'MEDIA_PREVIEW_SIZE_MISMATCH',
        400,
        'Received size differs from declared size',
      );
    return { byteSize, input };
  } catch (cause) {
    if (
      cause instanceof PreviewReceiveError ||
      cause instanceof ZodError ||
      cause instanceof SyntaxError
    )
      throw cause;
    throw error(
      'MEDIA_PREVIEW_RECEIVE_FAILED',
      400,
      'Preview stream failed or multipart body was truncated',
      cause,
    );
  } finally {
    clearTimeout(idle);
    clearTimeout(total);
    options.signal.removeEventListener('abort', abort);
    request.signal.removeEventListener('abort', abort);
  }
}

/** Authorize before evaluating a route's runtime operation or parsing input. */
export async function previewResponse(
  request: Request,
  operation: () => unknown | Promise<unknown>,
  status = 200,
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    await requireOwner(request);
    const result = await operation();
    return result instanceof Response
      ? result
      : Response.json(result, { status, headers });
  } catch (error) {
    const previewId = (error as { previewId?: string })?.previewId;
    if (error instanceof ZodError || error instanceof SyntaxError)
      return Response.json(
        {
          code: 'MEDIA_PREVIEW_INPUT_INVALID',
          ...(previewId ? { previewId } : {}),
          message: '请提供有效的预览目标和完整处理参数',
          ...(error instanceof ZodError
            ? {
                fields: error.issues.map((issue) => ({
                  field: issue.path.join('.'),
                  message: issue.message,
                })),
              }
            : {}),
        },
        { status: error instanceof ZodError ? 422 : 400, headers },
      );
    const detail = error as { code?: string; status?: number };
    const analysis = analyzeMediaError(error);
    const code =
      analysis.code === 'INSUFFICIENT_DISK_SPACE'
        ? analysis.code
        : (detail?.code ??
          (analysis.code === 'MEDIA_PROCESS_FAILED'
            ? 'MEDIA_PREVIEW_FAILED'
            : analysis.code));
    const failureStatus =
      detail?.status ??
      (code === 'INSUFFICIENT_DISK_SPACE'
        ? 507
        : [
              'MEDIA_FORMAT_UNSUPPORTED',
              'MEDIA_IDENTIFICATION_FAILED',
              'MEDIA_RESOURCE_LIMIT',
              'MEDIA_WATERMARK_INVALID',
            ].includes(code)
          ? 422
          : 500);
    if (failureStatus >= 500)
      createRuntimeLogger('media.preview', 'info').error(
        { err: error, path: new URL(request.url).pathname },
        'Media preview request failed',
      );
    return Response.json(
      {
        code,
        message: error instanceof Error ? error.message : String(error),
        ...(previewId ? { previewId } : {}),
      },
      { status: failureStatus, headers },
    );
  }
}
