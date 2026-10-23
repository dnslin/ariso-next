import { createContentMutations } from '../../../src/server/runtime/content-mutations.ts';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from '../../../src/app/api/uploads/sessions/[id]/route.ts';
import { readUploadJson } from '../../../src/server/upload/http.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';

vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: vi.fn() }),
}));
const cancel = vi.fn();
const context = { params: Promise.resolve({ id: 'session' }) };
function request(body?: string) {
  return new Request('http://ariso.test/api/uploads/sessions/session', {
    method: 'DELETE',
    ...(body === undefined
      ? {}
      : {
          body: Readable.toWeb(Readable.from([Buffer.from(body)])),
          duplex: 'half',
        }),
  } as RequestInit);
}
beforeEach(() => {
  vi.resetAllMocks();
  cancel.mockResolvedValue({ id: 'session', state: 'cancelled' });
  vi.mocked(getServerRuntime).mockReturnValue({
    contentMutations: createContentMutations(),
    uploads: { cancel },
  } as unknown as ReturnType<typeof getServerRuntime>);
});

describe('owner upload cancellation HTTP body', () => {
  it.each([undefined, '', 'null'])(
    'accepts the optional body %j',
    async (body) => {
      const response = await DELETE(request(body), context);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ state: 'cancelled' });
      expect(cancel).toHaveBeenCalledWith('session', false);
    },
  );
  it('retains the explicit failed-transfer cancellation reason', async () => {
    const response = await DELETE(
      request('{"reason":"transfer-failed"}'),
      context,
    );
    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledWith('session', true);
  });
  it.each(['{', ' '])(
    'rejects malformed JSON %j before cancelling',
    async (body) => {
      const response = await DELETE(request(body), context);
      expect(response.status).toBe(400);
      expect(cancel).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, ''])(
    'keeps required upload metadata strict %j',
    async (body) => {
      if (body === undefined) {
        await expect(readUploadJson(request(body))).rejects.toMatchObject({
          code: 'UPLOAD_INVALID_INPUT',
          status: 400,
          message: '缺少请求内容',
        });
      } else {
        await expect(readUploadJson(request(body))).rejects.toBeInstanceOf(
          SyntaxError,
        );
      }
    },
  );
  it('retains the rejection of a leading UTF-8 BOM in upload metadata', async () => {
    await expect(
      readUploadJson(request('\uFEFF{"reason":"transfer-failed"}')),
    ).rejects.toBeInstanceOf(SyntaxError);
  });
  it.each([undefined, '1', String(512 * 1024)])(
    'accepts exactly 256 KiB of upload metadata with Content-Length %s',
    async (length) => {
      const value = '😀'.repeat((256 * 1024 - 4) / 4) + 'ab';
      const input = request(JSON.stringify(value));
      if (length) input.headers.set('content-length', length);
      expect(await readUploadJson(input)).toBe(value);
      expect(input.body?.locked).toBe(false);
    },
  );
  it.each([undefined, '1'])(
    'rejects oversized metadata before cancelling the upload with Content-Length %s',
    async (length) => {
      const chunks = [
        new Uint8Array(256 * 1024),
        new Uint8Array(1),
        new Uint8Array(1),
      ];
      let reads = 0;
      const cancelBody = vi.fn();
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            controller.enqueue(chunks[reads++]);
          },
          cancel: cancelBody,
        },
        { highWaterMark: 0 },
      );
      const input = new Request(
        'http://ariso.test/api/uploads/sessions/session',
        {
          method: 'DELETE',
          headers: length ? { 'content-length': length } : {},
          body,
          duplex: 'half',
        } as RequestInit,
      );
      const response = await DELETE(input, context);
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({
        code: 'UPLOAD_METADATA_TOO_LARGE',
        message: '上传元数据超过 256 KiB',
      });
      expect(cancel).not.toHaveBeenCalled();
      expect(reads).toBe(2);
      expect(cancelBody).toHaveBeenCalledOnce();
      expect(body.locked).toBe(false);
    },
  );
  it('preserves the original stream error and releases the reader', async () => {
    const failure = new Error('connection interrupted');
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(failure);
      },
    });
    const input = new Request('http://ariso.test', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);
    await expect(readUploadJson(input)).rejects.toBe(failure);
    expect(body.locked).toBe(false);
  });
});
