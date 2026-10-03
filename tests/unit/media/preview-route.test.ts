import * as fsPromises from 'node:fs/promises';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { POST } from '../../../src/app/api/media/previews/route.ts';
import { GET, DELETE } from '../../../src/app/api/media/previews/[id]/route.ts';
import { GET as RESULT } from '../../../src/app/api/media/previews/[id]/result/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { receivePreviewMultipart } from '../../../src/server/media/preview-http.ts';
import { createMediaResources } from '../../../src/server/media/resources.ts';
import { initialMediaSettings } from '../../../src/server/media/validation.ts';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

const { receive, get, cancel, result, logError } = vi.hoisted(() => ({
  receive: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  result: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: logError }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    mediaQueue: { previews: { receive, get, cancel, result } },
  } as unknown as ReturnType<typeof getServerRuntime>);
});
const context = { params: Promise.resolve({ id: 'preview-id' }) };
const routes = [
  ['POST', (request: Request) => POST(request), receive],
  ['GET', (request: Request) => GET(request, context), get],
  ['DELETE', (request: Request) => DELETE(request, context), cancel],
  ['GET result', (request: Request) => RESULT(request, context), result],
] as const;

describe('owner preview routes', () => {
  it.each(routes)(
    'authorizes %s before touching the runtime',
    async (_name, route, operation) => {
      for (const [code, status] of [
        ['UNAUTHORIZED', 401],
        ['INVALID_ORIGIN', 403],
      ] as const) {
        vi.mocked(requireOwner).mockRejectedValue(
          Object.assign(new Error('Owner required'), { code, status }),
        );
        const response = await route(
          new Request('http://localhost/api/media/previews'),
        );
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({
          code,
          message: 'Owner required',
        });
        expect(getServerRuntime).not.toHaveBeenCalled();
        expect(operation).not.toHaveBeenCalled();
      }
    },
  );
  it.each(routes)(
    'passes through %s state and waits for its operation',
    async (name, route, operation) => {
      const state = {
        id: 'preview-id',
        status: name === 'DELETE' ? 'cancelled' : 'queued',
      };
      operation.mockResolvedValue(state);
      const request = new Request('http://localhost/api/media/previews');
      const response = await route(request);
      expect(response.status).toBe(name === 'POST' ? 202 : 200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual(state);
      expect(operation).toHaveBeenCalledWith(
        name === 'POST' ? request : 'preview-id',
      );
    },
  );
  it.each([400, 404, 409, 410, 413, 422, 507, 503])(
    'preserves explicit lifecycle/request status %s',
    async (status) => {
      receive.mockRejectedValue(
        Object.assign(new Error('Preview unavailable'), {
          code: 'MEDIA_PREVIEW_UNAVAILABLE',
          status,
        }),
      );
      const response = await POST(
        new Request('http://localhost/api/media/previews'),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        code: 'MEDIA_PREVIEW_UNAVAILABLE',
        message: 'Preview unavailable',
      });
    },
  );
  it('streams the exact core result Response without serializing its body', async () => {
    const response = new Response('result-bytes', {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
    result.mockResolvedValue(response);
    expect(
      await RESULT(
        new Request('http://localhost/api/media/previews/preview-id/result'),
        context,
      ),
    ).toBe(response);
  });
  it.each([
    new SyntaxError('bad JSON'),
    new ZodError([
      {
        code: 'custom',
        path: ['settings', 'quality'],
        message: 'invalid quality',
      },
    ]),
  ])('returns the input error as 400 or 422: %s', async (error) => {
    receive.mockRejectedValue(error);
    const response = await POST(
      new Request('http://localhost/api/media/previews'),
    );
    expect(response.status).toBe(error instanceof ZodError ? 422 : 400);
    expect(await response.json()).toMatchObject({
      code: 'MEDIA_PREVIEW_INPUT_INVALID',
    });
  });
  it.each([
    new SyntaxError('bad JSON'),
    new ZodError([
      { code: 'custom', path: ['settings'], message: 'invalid settings' },
    ]),
    Object.assign(new Error('receive failed'), {
      code: 'MEDIA_PREVIEW_REQUEST',
      status: 400,
    }),
  ])(
    'returns the registered preview ID on receive failures: %s',
    async (error) => {
      receive.mockRejectedValue(
        Object.assign(error, { previewId: 'failed-preview' }),
      );
      const response = await POST(
        new Request('http://localhost/api/media/previews'),
      );
      expect(response.status).toBe(error instanceof ZodError ? 422 : 400);
      expect(await response.json()).toMatchObject({
        previewId: 'failed-preview',
      });
    },
  );
  it('logs disk diagnostics and unexpected failures', async () => {
    for (const error of [
      Object.assign(new Error('No space at /data/tmp/previews/source'), {
        code: 'ENOSPC',
      }),
      new Error('Database failure'),
    ]) {
      receive.mockRejectedValue(error);
      const response = await POST(
        new Request('http://localhost/api/media/previews'),
      );
      expect(response.status).toBe('code' in error ? 507 : 500);
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ err: error }),
        'Media preview request failed',
      );
    }
  });
});

const renderingSettings = Object.fromEntries(
  Object.entries(initialMediaSettings).filter(
    ([key]) =>
      !['defaultVisibility', 'defaultLinkVersion', 'concurrency'].includes(key),
  ),
);
const input = { target: 'compressed', settings: renderingSettings };
function form(
  bytes = Buffer.from('test-image'),
  options: unknown = input,
  metadataFirst = false,
) {
  const body = new FormData();
  if (metadataFirst) body.append('options', JSON.stringify(options));
  body.append('file', new Blob([new Uint8Array(bytes)]), 'test.png');
  if (!metadataFirst) body.append('options', JSON.stringify(options));
  return body;
}
let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
async function reception(
  body: FormData,
  maxBytes = 128 * 1024,
  options: {
    signal?: AbortSignal;
    requestSignal?: AbortSignal;
    resources?: ReturnType<typeof createMediaResources>;
  } = {},
) {
  directory = await mkdtemp(join(tmpdir(), 'ariso-preview-multipart-'));
  const path = join(directory, 'source');
  const resources = options.resources ?? createMediaResources();
  const encoded = new Request('http://localhost/api/media/previews', {
    method: 'POST',
    body,
  });
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close();
        return;
      }
      const next = bytes.subarray(offset, offset + 16 * 1024);
      offset += next.length;
      controller.enqueue(next);
    },
  });
  const request = new Request('http://localhost/api/media/previews', {
    method: 'POST',
    headers: encoded.headers,
    body: stream,
    duplex: 'half',
    signal: options.requestSignal,
  } as RequestInit);
  return {
    path,
    resources,
    request,
    execute: () =>
      receivePreviewMultipart(request, {
        path,
        resources,
        maxBytes,
        signal: options.signal ?? new AbortController().signal,
      }),
  };
}

describe('streaming preview multipart reception', () => {
  it('writes exact preview bytes across partial native writes without reserving the chunk twice', async () => {
    const original =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    vi.mocked(fsPromises.open).mockImplementationOnce(async (...args) => {
      const handle = await original.open(...args);
      const write = handle.write.bind(handle);
      vi.spyOn(handle, 'write').mockImplementation(
        // Vitest infers FileHandle.write's last (string) overload.
        ((buffer: Buffer, offset: number, length: number) =>
          write(buffer, offset, Math.min(length, 3))) as typeof handle.write,
      );
      return handle;
    });
    const bytes = Buffer.from('partial-preview-image');
    const task = await reception(form(bytes));
    const reserve = vi.spyOn(task.resources, 'reserveWrite');
    const consume = vi.spyOn(task.resources, 'consumeWrite');
    const release = vi.spyOn(task.resources, 'releaseWrite');
    expect(await task.execute()).toEqual({ byteSize: bytes.length, input });
    expect(await readFile(task.path)).toEqual(bytes);
    expect(reserve.mock.calls.reduce((sum, call) => sum + call[2], 0)).toBe(
      bytes.length,
    );
    expect(consume.mock.calls.length).toBeGreaterThan(1);
    expect(consume.mock.calls.reduce((sum, call) => sum + call[1], 0)).toBe(
      bytes.length,
    );
    expect(release).toHaveBeenCalledExactlyOnceWith(task.path);
  });
  it('reports a native write with no progress and releases its reservation', async () => {
    const original =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    vi.mocked(fsPromises.open).mockImplementationOnce(async (...args) => {
      const handle = await original.open(...args);
      vi.spyOn(handle, 'write').mockResolvedValueOnce({
        bytesWritten: 0,
        buffer: '',
      });
      return handle;
    });
    const task = await reception(form());
    const release = vi.spyOn(task.resources, 'releaseWrite');
    await expect(task.execute()).rejects.toMatchObject({
      code: 'MEDIA_PREVIEW_RECEIVE_FAILED',
      status: 500,
      cause: { message: `No write progress at ${task.path}` },
    });
    expect(await readFile(task.path)).toEqual(Buffer.alloc(0));
    expect(release).toHaveBeenCalledExactlyOnceWith(task.path);
  });
  it.each([true, false])(
    'accepts metadata first=%s and writes exact bytes with per-chunk disk reservations',
    async (metadataFirst) => {
      const bytes = Buffer.alloc(100 * 1024, 97);
      const task = await reception(form(bytes, input, metadataFirst));
      const reserve = vi.spyOn(task.resources, 'reserveWrite');
      const release = vi.spyOn(task.resources, 'releaseWrite');
      expect(await task.execute()).toEqual({ byteSize: bytes.length, input });
      expect(await readFile(task.path)).toEqual(bytes);
      expect(reserve).toHaveBeenCalled();
      expect(
        reserve.mock.calls.every((call) => call[2] > 0 && call[2] <= 64 * 1024),
      ).toBe(true);
      expect(reserve.mock.calls.reduce((sum, call) => sum + call[2], 0)).toBe(
        bytes.length,
      );
      expect(release).toHaveBeenCalledWith(task.path);
    },
  );
  it('accepts exactly the configured file limit and rejects one byte beyond it', async () => {
    const accepted = await reception(form(Buffer.alloc(16)), 16);
    expect((await accepted.execute()).byteSize).toBe(16);
    await rm(directory!, { recursive: true, force: true });
    const rejected = await reception(form(Buffer.alloc(17)), 16);
    await expect(rejected.execute()).rejects.toMatchObject({ status: 413 });
  });
  it.each([
    'missing options',
    'missing file',
    'extra field',
    'extra file',
    'wrong file name',
    'empty file',
  ])('rejects %s', async (mode) => {
    const body = form(mode === 'empty file' ? Buffer.alloc(0) : undefined);
    if (mode === 'missing options') body.delete('options');
    if (mode === 'missing file') body.delete('file');
    if (mode === 'extra field') body.append('label', 'unknown');
    if (mode === 'extra file')
      body.append('file', new Blob(['second']), 'second.png');
    if (mode === 'wrong file name') {
      body.delete('file');
      body.append('image', new Blob(['wrong']), 'wrong.png');
    }
    await expect((await reception(body)).execute()).rejects.toMatchObject({
      status: 400,
    });
  });
  it.each(['json', 'schema', 'envelope'])(
    'rejects malformed %s input',
    async (mode) => {
      const body = form();
      body.set(
        'options',
        mode === 'json'
          ? '{'
          : mode === 'envelope'
            ? 'x'.repeat(65537)
            : JSON.stringify({ target: 'compressed', settings: {} }),
      );
      const task = await reception(body);
      if (mode === 'envelope')
        await expect(task.execute()).rejects.toMatchObject({ status: 413 });
      else
        await expect(task.execute()).rejects.toBeInstanceOf(
          mode === 'json' ? SyntaxError : ZodError,
        );
    },
  );
  it('rejects a forged Content-Length while still counting actual bytes', async () => {
    const task = await reception(form());
    task.request.headers.set('content-length', '3');
    await expect(task.execute()).rejects.toMatchObject({
      code: 'MEDIA_PREVIEW_SIZE_MISMATCH',
      status: 400,
    });
  });
  it('reports a truncated multipart stream without accepting its file', async () => {
    const task = await reception(form());
    const bytes = new Uint8Array(await task.request.arrayBuffer());
    const request = new Request(task.request.url, {
      method: 'POST',
      headers: task.request.headers,
      body: bytes.subarray(0, bytes.length - 10),
    });
    await expect(
      receivePreviewMultipart(request, {
        path: task.path,
        resources: task.resources,
        maxBytes: 100,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'MEDIA_PREVIEW_RECEIVE_FAILED',
      status: 400,
    });
  });
  it('terminates a reception with no progress at the shared 120-second idle limit', async () => {
    vi.useFakeTimers();
    try {
      directory = await mkdtemp(join(tmpdir(), 'ariso-preview-timeout-'));
      const cancelled = vi.fn();
      const request = new Request('http://localhost/api/media/previews', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=test' },
        body: new ReadableStream({ cancel: cancelled }),
        duplex: 'half',
      } as RequestInit);
      const pending = expect(
        receivePreviewMultipart(request, {
          path: join(directory, 'source'),
          resources: createMediaResources(),
          maxBytes: 100,
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        code: 'MEDIA_PREVIEW_RECEIVE_TIMEOUT',
        status: 408,
      });
      await vi.advanceTimersByTimeAsync(120_000);
      await pending;
      expect(cancelled).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['runtime', 'request'])(
    'observes an aborted %s signal before file processing',
    async (which) => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));
      const task = await reception(
        form(),
        undefined,
        which === 'runtime'
          ? { signal: controller.signal }
          : { requestSignal: controller.signal },
      );
      await expect(task.execute()).rejects.toMatchObject({
        code: 'MEDIA_PREVIEW_CANCELLED',
        status: 400,
      });
    },
  );
  it('waits for an in-flight native write before cancellation closes its handle and releases its reservation', async () => {
    const original =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    const entered = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    const close = vi.fn();
    vi.mocked(fsPromises.open).mockImplementationOnce(async (...args) => {
      const handle = await original.open(...args);
      const write = handle.write.bind(handle);
      const nativeClose = handle.close.bind(handle);
      vi.spyOn(handle, 'write').mockImplementationOnce(async () => {
        entered.resolve();
        await releaseWrite.promise;
        return write('test-image');
      });
      vi.spyOn(handle, 'close').mockImplementation(async () => {
        close();
        await nativeClose();
      });
      return handle;
    });
    const controller = new AbortController();
    const task = await reception(form(), undefined, {
      signal: controller.signal,
    });
    const reservationReleased = vi.spyOn(task.resources, 'releaseWrite');
    let settled = false;
    const pending = task.execute().finally(() => {
      settled = true;
    });
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'MEDIA_PREVIEW_CANCELLED',
    });
    await entered.promise;
    try {
      controller.abort();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(close).not.toHaveBeenCalled();
      expect(reservationReleased).not.toHaveBeenCalled();
    } finally {
      releaseWrite.resolve();
      await rejected;
    }
    expect(close).toHaveBeenCalledOnce();
    expect(reservationReleased).toHaveBeenCalledWith(task.path);
    expect(await readFile(task.path, 'utf8')).toBe('test-image');
  });
  it('preserves disk exhaustion and releases write responsibility after failure', async () => {
    const resources = createMediaResources();
    const reserve = vi
      .spyOn(resources, 'reserveWrite')
      .mockImplementation(() => {
        throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
      });
    const release = vi.spyOn(resources, 'releaseWrite');
    const task = await reception(form(), undefined, { resources });
    await expect(task.execute()).rejects.toMatchObject({ status: 507 });
    expect(reserve).toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(task.path);
  });
});
