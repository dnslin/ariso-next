import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCorsSample } from '../../../src/components/storage/cors-transport.ts';
import type { CorsTestSession } from '../../../src/server/storage/cors-types.ts';

const session: CorsTestSession = {
  probeId: 'probe',
  storageId: 'storage',
  revision: 1,
  origin: 'https://ariso.example',
  payload: 'sample',
  expiresAt: '2030-01-01T00:00:00.000Z',
  upload: {
    url: 'https://bucket.example/put',
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    key: 'probe',
    expiresAt: '2030-01-01T00:00:00.000Z',
  },
  get: {
    url: 'https://bucket.example/get',
    method: 'GET',
    headers: {},
    key: 'probe',
    expiresAt: '2030-01-01T00:00:00.000Z',
  },
  head: {
    url: 'https://bucket.example/head',
    method: 'HEAD',
    headers: {},
    key: 'probe',
    expiresAt: '2030-01-01T00:00:00.000Z',
  },
};
function response(body: string | null, type = 'cors', status = 200) {
  const result = new Response(body, {
    status,
    headers: { 'content-length': '6' },
  });
  Object.defineProperty(result, 'type', { value: type });
  return result;
}
afterEach(() => vi.unstubAllGlobals());
describe('CORS browser sample', () => {
  it('uses the exact signed methods and headers without credentials and reads GET bytes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response('sample'))
      .mockResolvedValueOnce(response(null));
    vi.stubGlobal('fetch', fetcher);
    const results = await runCorsSample(session, new AbortController().signal);
    expect(
      results.map(({ method, status, responseType, error }) => ({
        method,
        status,
        responseType,
        error,
      })),
    ).toEqual(
      ['PUT', 'GET', 'HEAD'].map((method) => ({
        method,
        status: 200,
        responseType: 'cors',
        error: undefined,
      })),
    );
    for (const [index, signature] of [
      session.upload,
      session.get,
      session.head,
    ].entries()) {
      expect(fetcher.mock.calls[index]).toEqual([
        signature.url,
        expect.objectContaining({
          method: signature.method,
          headers: signature.headers,
          mode: 'cors',
          credentials: 'omit',
          redirect: 'error',
        }),
      ]);
    }
    expect(fetcher.mock.calls[0]![1].body).toBe(session.payload);
  });
  it('rejects opaque success and never sends follow-up reads', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(null, 'opaque'));
    vi.stubGlobal('fetch', fetcher);
    const results = await runCorsSample(session, new AbortController().signal);
    expect(results[0]!.error).toMatch(/不可读/);
    expect(results.every((result) => !!result.error)).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not accept a readable GET with different contents', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response('changed'));
    vi.stubGlobal('fetch', fetcher);
    const results = await runCorsSample(session, new AbortController().signal);
    expect(results[1]!.error).toMatch(/内容/);
    expect(results[2]!.status).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('reports network uncertainty without guessing CORS or exposing a signed URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(
          new TypeError('failed https://bucket.example/?secret=signature'),
        ),
    );
    const results = await runCorsSample(session, new AbortController().signal);
    expect(results[0]).toMatchObject({ status: 0, responseType: 'error' });
    expect(results[0]!.error).toMatch(/CORS.*网络/);
    expect(JSON.stringify(results)).not.toContain('signature');
  });
  it('stops aborted work before starting any remote operation', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort();
    const results = await runCorsSample(session, controller.signal);
    expect(results[0]!.error).toMatch(/中断/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
