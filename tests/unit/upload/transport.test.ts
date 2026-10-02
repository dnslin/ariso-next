import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const upload = vi.fn();
  const cancelAll = vi.fn();
  const destroy = vi.fn();
  const use = vi.fn();
  return { handlers, upload, cancelAll, destroy, use };
});
vi.mock('@uppy/core', () => ({
  default: class {
    addFile() {}
    use(...args: unknown[]) {
      mock.use(...args);
    }
    on(event: string, callback: (...args: unknown[]) => void) {
      mock.handlers.set(event, callback);
    }
    upload() {
      return mock.upload();
    }
    cancelAll() {
      mock.cancelAll();
    }
    destroy() {
      mock.destroy();
    }
  },
}));
vi.mock('@uppy/xhr-upload', () => ({ default: class {} }));
import { createUploadTransport } from '../../../src/components/upload/transport.ts';

const request = vi.fn<typeof fetch>();
const direct = {
  route: 'direct',
  reason: null,
  upload: {
    url: 'https://s3.example/temporary?signature=test',
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  },
};
const failed = {
  id: 'session',
  state: 'failed',
  cleanupStatus: 'pending',
  imageId: null,
  jobId: null,
};
const accepted = {
  ...failed,
  state: 'accepted',
  imageId: 'same-image',
  jobId: 'same-job',
};
function transport() {
  return createUploadTransport(
    new File(['image'], 'photo.png', { type: 'image/png' }),
    'item',
  );
}
async function begin() {
  await vi.waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.handlers.clear();
  vi.stubGlobal('fetch', request);
  request.mockReset().mockResolvedValueOnce(Response.json(direct));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fixed upload routes and transmission settlement', () => {
  it('sends raw PUT with fixed headers, completes only after success and reports the selected route', async () => {
    mock.upload.mockResolvedValue({ successful: [{ response: { body: {} } }] });
    request.mockResolvedValueOnce(Response.json(accepted));
    const onRoute = vi.fn();
    const t = transport();
    expect(await t.upload('session', vi.fn(), onRoute, vi.fn())).toEqual(
      accepted,
    );
    expect(onRoute).toHaveBeenCalledWith('direct', null);
    expect(mock.use.mock.calls[0][1]).toMatchObject({
      endpoint: direct.upload.url,
      method: 'PUT',
      formData: false,
      headers: direct.upload.headers,
      timeout: 0,
    });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/api/uploads/sessions/session/begin',
      '/api/uploads/sessions/session/complete',
    ]);
    t.destroy();
    expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it('keeps relay multipart and returns its real response without a second completion', async () => {
    request
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({ route: 'relay', reason: 'CORS outdated' }),
      );
    mock.upload.mockResolvedValue({
      successful: [{ response: { body: accepted } }],
    });
    const route = vi.fn();
    expect(
      await transport().upload('session', vi.fn(), route, vi.fn()),
    ).toEqual(accepted);
    expect(mock.use.mock.calls[0][1]).toMatchObject({
      endpoint: '/api/uploads/sessions/session/content',
      formData: true,
      method: 'POST',
    });
    expect(route).toHaveBeenCalledWith('relay', 'CORS outdated');
    expect(request).toHaveBeenCalledOnce();
  });
  it('ends a stalled PUT, releases its transport, and persists failure without relay retry', async () => {
    mock.upload.mockReturnValue(new Promise(() => {}));
    request.mockResolvedValueOnce(Response.json(failed));
    const t = transport();
    const result = t.upload('session', vi.fn(), vi.fn(), vi.fn());
    await begin();
    vi.useFakeTimers();
    mock.handlers.get('upload-progress')!(null, {
      bytesUploaded: 1,
      bytesTotal: 5,
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toEqual(failed);
    expect(mock.cancelAll).toHaveBeenCalledOnce();
    expect(request.mock.calls[1]).toEqual([
      '/api/uploads/sessions/session',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ reason: 'transfer-failed' }),
      }),
    ]);
    expect(mock.upload).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    t.destroy();
  });
  it('enforces the total PUT budget despite continued byte progress', async () => {
    vi.useFakeTimers();
    mock.upload.mockReturnValue(new Promise(() => {}));
    request.mockResolvedValueOnce(Response.json(failed));
    const result = transport().upload('session', vi.fn(), vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    for (let step = 1; step <= 30; step++) {
      mock.handlers.get('upload-progress')!(null, {
        bytesUploaded: step,
        bytesTotal: 100,
      });
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(await result).toEqual(failed);
    expect(mock.cancelAll).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('releases a pending transport on destroy without claiming the server cancelled', async () => {
    mock.upload.mockReturnValue(new Promise(() => {}));
    const t = transport();
    const result = t.upload('session', vi.fn(), vi.fn(), vi.fn());
    const rejection = expect(result).rejects.toThrow('Aborted');
    await begin();
    t.destroy();
    await rejection;
    expect(request).toHaveBeenCalledOnce();
    expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it('keeps a disconnected complete unknown rather than deleting or retransmitting accepted bytes', async () => {
    mock.upload.mockResolvedValue({ successful: [{ response: { body: {} } }] });
    request.mockRejectedValueOnce(new TypeError('complete disconnected'));
    await expect(
      transport().upload('session', vi.fn(), vi.fn(), vi.fn()),
    ).rejects.toThrow('complete disconnected');
    expect(mock.cancelAll).not.toHaveBeenCalled();
    expect(
      request.mock.calls.every(([, init]) => init?.method === 'POST'),
    ).toBe(true);
  });
  it('resubmits a near-expired session before any PUT using the retained file', async () => {
    request
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          ...direct,
          upload: {
            ...direct.upload,
            expiresAt: new Date(Date.now() + 5000).toISOString(),
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: 'replacement', sessions: [{ id: 'new-session' }] }),
      )
      .mockResolvedValueOnce(Response.json(direct))
      .mockResolvedValueOnce(Response.json(accepted));
    mock.upload.mockResolvedValue({ successful: [{ response: { body: {} } }] });
    const resubmit = vi.fn();
    expect(
      await transport().upload('session', vi.fn(), vi.fn(), resubmit),
    ).toEqual(accepted);
    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.use).toHaveBeenCalledOnce();
    expect(resubmit).toHaveBeenCalledOnce();
    expect(resubmit.mock.calls[0]).toEqual([
      expect.any(String),
      'session',
      expect.any(Promise),
    ]);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/api/uploads/sessions/session/begin',
      '/api/uploads/sessions/session/resubmit',
      '/api/uploads/sessions/new-session/begin',
      '/api/uploads/sessions/new-session/complete',
    ]);
  });
});

it('retains the idempotent resubmit request when its response is lost, without starting any PUT', async () => {
  request
    .mockReset()
    .mockResolvedValueOnce(
      Response.json({
        ...direct,
        upload: {
          ...direct.upload,
          expiresAt: new Date(Date.now() + 5000).toISOString(),
        },
      }),
    )
    .mockRejectedValueOnce(new TypeError('resubmit response lost'));
  const resubmit = vi.fn();
  await expect(
    transport().upload('session', vi.fn(), vi.fn(), resubmit),
  ).rejects.toThrow('resubmit response lost');
  expect(resubmit).toHaveBeenCalledOnce();
  expect(request.mock.calls[1]).toEqual([
    '/api/uploads/sessions/session/resubmit',
    expect.objectContaining({
      body: JSON.stringify({ requestId: resubmit.mock.calls[0][0] }),
    }),
  ]);
  expect(mock.use).not.toHaveBeenCalled();
  expect(mock.upload).not.toHaveBeenCalled();
});

it('does not begin or PUT a replacement after cancellation settles its metadata', async () => {
  request
    .mockReset()
    .mockResolvedValueOnce(
      Response.json({
        ...direct,
        upload: {
          ...direct.upload,
          expiresAt: new Date(Date.now() + 5000).toISOString(),
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ id: 'replacement', sessions: [{ id: 'new-session' }] }),
    );
  const t = transport();
  await expect(
    t.upload('session', vi.fn(), vi.fn(), async (_id, _previous, pending) => {
      await pending;
      t.destroy();
    }),
  ).rejects.toThrow();
  expect(mock.use).not.toHaveBeenCalled();
  expect(mock.upload).not.toHaveBeenCalled();
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    '/api/uploads/sessions/session/begin',
    '/api/uploads/sessions/session/resubmit',
  ]);
});
