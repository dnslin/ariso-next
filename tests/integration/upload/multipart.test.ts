import { appendFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { receiveMultipart } from '../../../src/server/upload/multipart';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-multipart-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
function body(contents: string, extra = '') {
  return Buffer.from(
    `--test\r\nContent-Disposition: form-data; name="file"; filename="../../photo.png"\r\nContent-Type: image/png\r\n\r\n${contents}\r\n${extra}--test--\r\n`,
  );
}
function request(bytes: Buffer, length?: number, chunkSize = 3) {
  return new Request('http://localhost/upload', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=test',
      ...(length === undefined ? {} : { 'content-length': String(length) }),
    },
    body: new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += chunkSize)
          controller.enqueue(bytes.subarray(offset, offset + chunkSize));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);
}
function receive(
  req: Request,
  declaredSize = 5,
  maxBytes = 5,
  signal = new AbortController().signal,
) {
  return receiveMultipart(req, {
    path: join(directory, 'original'),
    declaredSize,
    maxBytes,
    signal,
  });
}
describe('production multipart reception', () => {
  it.each([0, 1])(
    'verifies the real 50 MiB boundary plus %i bytes',
    async (extra) => {
      const maximum = 50 * 1024 * 1024;
      const req = request(
        body('x'.repeat(maximum + extra)),
        undefined,
        64 * 1024,
      );
      const result = receive(req, maximum + extra, maximum);
      if (extra)
        await expect(result).rejects.toMatchObject({
          code: 'UPLOAD_FILE_TOO_LARGE',
        });
      else {
        await expect(result).resolves.toEqual({ byteSize: maximum });
        expect((await stat(join(directory, 'original'))).size).toBe(maximum);
      }
    },
  );
  it('cancels a stream after 120 seconds without progress', async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const req = new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=test' },
        body: new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        duplex: 'half',
      } as RequestInit);
      const pending = expect(receive(req)).rejects.toMatchObject({
        code: 'UPLOAD_RECEIVE_TIMEOUT',
        status: 408,
      });
      await vi.advanceTimersByTimeAsync(120_000);
      await pending;
      expect(cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('enforces the total 1800 second budget despite continuing input', async () => {
    vi.useFakeTimers();
    let interval: ReturnType<typeof setInterval> | undefined;
    try {
      let cancelled = false;
      const req = new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=test' },
        body: new ReadableStream({
          start(controller) {
            interval = setInterval(
              () => controller.enqueue(Buffer.from('preamble')),
              60_000,
            );
          },
          cancel() {
            cancelled = true;
            clearInterval(interval);
          },
        }),
        duplex: 'half',
      } as RequestInit);
      const pending = expect(receive(req)).rejects.toMatchObject({
        code: 'UPLOAD_RECEIVE_TIMEOUT',
        message: 'Upload exceeded the 1800 second reception budget',
      });
      await vi.advanceTimersByTimeAsync(1_800_000);
      await pending;
      expect(cancelled).toBe(true);
    } finally {
      clearInterval(interval);
      vi.useRealTimers();
    }
  });
  it('checks the actual file size independently of stream counters', async () => {
    await expect(
      receiveMultipart(request(body('image')), {
        path: join(directory, 'original'),
        declaredSize: 5,
        maxBytes: 5,
        signal: new AbortController().signal,
        onProgress() {
          appendFileSync(join(directory, 'original'), 'unexpected');
        },
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_SIZE_MISMATCH' });
  });
  it('maps injected native ENOSPC to a space error with its cause', async () => {
    const { open: originalOpen } =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    vi.mocked(fsPromises.open).mockImplementationOnce(async (...args) => {
      const handle = await originalOpen(...args);
      vi.spyOn(handle, 'write').mockRejectedValueOnce(
        Object.assign(new Error('injected disk full'), { code: 'ENOSPC' }),
      );
      return handle;
    });
    await expect(receive(request(body('image')))).rejects.toMatchObject({
      code: 'UPLOAD_INSUFFICIENT_SPACE',
      status: 507,
      cause: { code: 'ENOSPC' },
    });
  });
  it.each(['open', 'write', 'stat', 'close'] as const)(
    'reports %s disk failures as server errors with their cause',
    async (operation) => {
      const cause = Object.assign(new Error(`injected ${operation} failure`), {
        code: operation === 'open' ? 'EACCES' : 'EIO',
      });
      const { open: originalOpen } =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      vi.mocked(fsPromises.open).mockImplementationOnce(async (...args) => {
        if (operation === 'open') throw cause;
        const handle = await originalOpen(...args);
        if (operation === 'close') {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, 'close').mockImplementationOnce(async () => {
            await close();
            throw cause;
          });
        } else vi.spyOn(handle, operation).mockRejectedValueOnce(cause);
        return handle;
      });
      await expect(receive(request(body('image')))).rejects.toMatchObject({
        code: 'UPLOAD_RECEIVE_FAILED',
        status: 500,
        cause,
      });
    },
  );
  it('reports server progress persistence failures without blaming the client', async () => {
    const cause = new Error('progress database write failed');
    await expect(
      receiveMultipart(request(body('image')), {
        path: join(directory, 'original'),
        declaredSize: 5,
        maxBytes: 5,
        signal: new AbortController().signal,
        onProgress() {
          throw cause;
        },
      }),
    ).rejects.toMatchObject({
      code: 'UPLOAD_RECEIVE_FAILED',
      status: 500,
      cause,
    });
  });
  it('awaits a pending file write before cancellation resolves', async () => {
    const { open: originalOpen } =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.mocked(fsPromises.open).mockImplementationOnce(async (...args) => {
      const handle = await originalOpen(...args);
      const write = handle.write.bind(handle);
      vi.spyOn(handle, 'write').mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
        return write('image');
      });
      return handle;
    });
    const controller = new AbortController();
    let settled = false;
    const pending = receive(
      request(body('image'), undefined, 65536),
      5,
      5,
      controller.signal,
    ).finally(() => {
      settled = true;
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'UPLOAD_CANCELLED',
    });
    await entered.promise;
    controller.abort();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    release.resolve();
    await rejection;
    expect((await stat(join(directory, 'original'))).size).toBe(5);
  });
  it.each([false, true])(
    'writes exact boundary with known HTTP length=%s and ignores client paths',
    async (known) => {
      const bytes = body('image');
      await expect(
        receive(request(bytes, known ? bytes.length : undefined)),
      ).resolves.toEqual({ byteSize: 5 });
      expect(await readFile(join(directory, 'original'), 'utf8')).toBe('image');
    },
  );
  it('rejects an empty file', async () => {
    await expect(receive(request(body('')), 0)).rejects.toMatchObject({
      code: 'UPLOAD_EMPTY_FILE',
      status: 400,
    });
  });
  it('rejects missing file', async () => {
    await expect(
      receive(request(Buffer.from('--test--\r\n'))),
    ).rejects.toMatchObject({ code: 'UPLOAD_MISSING_FILE' });
  });
  it('rejects an extra field after the file', async () => {
    await expect(
      receive(
        request(
          body(
            'image',
            '--test\r\nContent-Disposition: form-data; name="extra"\r\n\r\nvalue\r\n',
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_UNKNOWN_FIELD' });
  });
  it('rejects a second file', async () => {
    await expect(
      receive(
        request(
          body(
            'image',
            '--test\r\nContent-Disposition: form-data; name="file"; filename="second.png"\r\n\r\na\r\n',
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_EXTRA_FILE' });
  });
  it('rejects a wrong file field', async () => {
    await expect(
      receive(
        request(
          Buffer.from(
            body('image').toString().replace('name="file"', 'name="other"'),
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_UNKNOWN_FIELD' });
  });
  it.each([4, 6])('rejects declared file size %i', async (size) => {
    await expect(
      receive(request(body('image')), size, 10),
    ).rejects.toMatchObject({ code: 'UPLOAD_SIZE_MISMATCH' });
  });
  it.each([-1, 1])('checks actual HTTP body length delta %i', async (delta) => {
    const bytes = body('image');
    await expect(
      receive(request(bytes, bytes.length + delta)),
    ).rejects.toMatchObject({ code: 'UPLOAD_SIZE_MISMATCH' });
  });
  it('rejects truncated multipart', async () => {
    await expect(
      receive(request(body('image').subarray(0, -5)), 100, 100),
    ).rejects.toMatchObject({ code: 'UPLOAD_RECEIVE_FAILED', status: 400 });
  });
  it('settles oversize reception and cancels the incoming stream early', async () => {
    let sent = 0;
    let cancelled = false;
    const bytes = body('x'.repeat(1024 * 1024));
    const req = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body: new ReadableStream({
        pull(controller) {
          controller.enqueue(bytes.subarray(sent, sent + 1024));
          sent += 1024;
          if (sent >= bytes.length) controller.close();
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: 'half',
    } as RequestInit);
    await expect(receive(req, 1024 * 1024, 5)).rejects.toMatchObject({
      code: 'UPLOAD_FILE_TOO_LARGE',
      status: 413,
    });
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(bytes.length);
    expect((await stat(join(directory, 'original'))).size).toBeLessThanOrEqual(
      5,
    );
  });
  it('settles cancellation while waiting on a stalled request', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const req = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body: new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      duplex: 'half',
    } as RequestInit);
    const pending = receive(req, 5, 5, controller.signal);
    controller.abort(new Error('user cancelled'));
    await expect(pending).rejects.toMatchObject({ code: 'UPLOAD_CANCELLED' });
    expect(cancelled).toBe(true);
  });
  it('checks known remaining bytes against actual available disk space', async () => {
    await expect(
      receive(
        request(body('image')),
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_INSUFFICIENT_SPACE', status: 507 });
  });
  it('does not overwrite an existing registered path', async () => {
    await receive(request(body('image')));
    await expect(receive(request(body('other')))).rejects.toMatchObject({
      code: 'UPLOAD_RECEIVE_FAILED',
      cause: { code: 'EEXIST' },
    });
    expect(await readFile(join(directory, 'original'), 'utf8')).toBe('image');
  });
  it('does not undo a completed receive on later cancellation', async () => {
    const controller = new AbortController();
    await receive(request(body('image')), 5, 5, controller.signal);
    controller.abort();
    expect(await readFile(join(directory, 'original'), 'utf8')).toBe('image');
  });
});
