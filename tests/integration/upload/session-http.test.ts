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
      await expect(readUploadJson(request(body))).rejects.toThrow();
    },
  );
});
