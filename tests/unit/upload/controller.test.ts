import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadController } from '../../../src/components/upload/controller.ts';
import type {
  UploadSessionResult,
  UploadSubmissionResult,
} from '../../../src/components/upload/types.ts';

const queued: UploadSessionResult = {
  id: 'session',
  queueItemId: 'queue-item',
  groupIndex: 0,
  state: 'queued',
  imageId: null,
  jobId: null,
  error: null,
  cleanupStatus: 'none',
};
function submission(
  session: Partial<UploadSessionResult> = {},
): UploadSubmissionResult {
  return {
    id: 'submission',
    storageId: 'local',
    visibility: 'private',
    sessions: [{ ...queued, ...session }],
  };
}
function accepted(
  status: 'queued' | 'running' | 'succeeded' | 'failed',
): UploadSubmissionResult {
  return submission({
    state: 'accepted',
    imageId: 'real-image',
    jobId: 'this-job',
    job: {
      id: 'this-job',
      status,
      error: status === 'failed' ? '压缩失败' : null,
      step: 'compress',
    },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const controllers: UploadController[] = [];
afterEach(() => {
  controllers.forEach((controller) => controller.destroy());
  controllers.length = 0;
  vi.restoreAllMocks();
});
function setup(onUnauthorized?: () => void) {
  const request = vi.fn<typeof fetch>();
  const transfer = deferred<UploadSessionResult>();
  let progress: (value: number) => void = () => {};
  const transport = {
    upload: vi.fn((_session: string, callback: (value: number) => void) => {
      progress = callback;
      return transfer.promise;
    }),
    destroy: vi.fn(),
  };
  const createTransport = vi.fn(() => transport);
  const controller = new UploadController({
    maxFileBytes: 20,
    queueLimit: 500,
    request,
    createTransport,
    onUnauthorized,
  });
  controllers.push(controller);
  const file = new File(['image'], 'same.png', { type: 'image/png' });
  const respond = (value: unknown, status = 200) => {
    if (value && typeof value === 'object' && 'sessions' in value) {
      (value as UploadSubmissionResult).sessions.forEach((session) => {
        session.queueItemId = controller.snapshot[0]!.id;
      });
    }
    request.mockResolvedValueOnce(Response.json(value, { status }));
  };
  return {
    controller,
    file,
    request,
    transport,
    createTransport,
    transfer,
    progress: (value: number) => progress(value),
    respond,
  };
}
async function untilTransfer(context: ReturnType<typeof setup>) {
  await vi.waitFor(() =>
    expect(context.transport.upload).toHaveBeenCalledOnce(),
  );
}

describe('manual upload controller', () => {
  it('binds the default global fetch receiver for browser-native invocation', async () => {
    const receivers: unknown[] = [];
    let queueItemId = '';
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation(function (
      this: unknown,
      url,
      init,
    ) {
      receivers.push(this);
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      if (init?.body)
        queueItemId = JSON.parse(init.body as string).files[0].queueItemId;
      const result =
        url === '/api/uploads/submissions'
          ? submission()
          : accepted('succeeded');
      result.sessions[0].queueItemId = queueItemId;
      return Promise.resolve(
        Response.json(result, {
          status: url === '/api/uploads/submissions' ? 201 : 200,
        }),
      );
    });
    const transport = {
      upload: vi.fn(async () => ({
        ...queued,
        state: 'accepted' as const,
        imageId: 'real-image',
        jobId: 'this-job',
      })),
      destroy: vi.fn(),
    };
    const controller = new UploadController({
      maxFileBytes: 20,
      queueLimit: 500,
      createTransport: () => transport,
    });
    controllers.push(controller);
    expect(
      controller.add(new File(['image'], 'photo.png', { type: 'image/png' })),
    ).toBeNull();
    await controller.start('private');
    expect(controller.snapshot[0]).toMatchObject({
      state: 'ready',
      imageId: 'real-image',
      previewUrl: null,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(receivers).toEqual([globalThis, globalThis]);
    expect(transport.upload).toHaveBeenCalledOnce();
    expect(transport.destroy).toHaveBeenCalledOnce();
  });
  it('validates inputs, queues manually, assigns independent IDs and releases removed previews', () => {
    const c = setup();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    expect(c.controller.add(new File([], 'empty.png'))).toContain('为空');
    expect(c.controller.add(new File(['x'.repeat(21)], 'large.png'))).toContain(
      '上限',
    );
    expect(
      c.controller.add(new File(['x'], 'image.gif', { type: 'image/gif' })),
    ).toContain('JPEG');
    expect(c.controller.add(c.file)).toBeNull();
    const first = c.controller.snapshot[0]!;
    expect(c.request).not.toHaveBeenCalled();
    expect(c.transport.upload).not.toHaveBeenCalled();
    expect(c.controller.add(c.file)).toBeNull();
    expect(c.controller.snapshot).toHaveLength(2);
    c.controller.remove(first.id);
    expect(revoke).toHaveBeenCalledWith(first.previewUrl);
    expect(c.transport.destroy).toHaveBeenCalledOnce();
    c.controller.add(c.file);
    expect(c.controller.snapshot[0]!.id).not.toBe(first.id);
  });
  it('keeps live transfer progress after queued polling and temporary read failure, then marks an unconfirmed ended transfer unknown', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.progress(30);
    c.respond(submission());
    await c.controller.refresh();
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'uploading',
      progress: 30,
    });
    c.progress(45);
    c.request.mockRejectedValueOnce(new Error('poll unavailable'));
    await c.controller.refresh();
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'uploading',
      progress: 45,
    });
    c.progress(70);
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'uploading',
      progress: 70,
    });
    c.respond(submission());
    c.transfer.reject(new Error('content disconnected'));
    await started;
    expect(c.controller.snapshot[0].state).toBe('unknown');
    expect(c.transport.upload).toHaveBeenCalledOnce();
  });
  it('freezes settings and only reports ready after this job succeeds, not 201 or transfer 100%', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private', 'local');
    await untilTransfer(c);
    expect(c.controller.snapshot[0]!.state).toBe('uploading');
    await c.controller.start('public', 'other');
    expect(c.request).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(c.request.mock.calls[0][1]!.body as string),
    ).toMatchObject({ visibility: 'private', storageId: 'local' });
    c.progress(100);
    expect(c.controller.snapshot[0]!.state).toBe('saving');
    c.respond(accepted('queued'));
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'processing-queued',
      imageId: 'real-image',
      jobId: 'this-job',
      previewUrl: null,
    });
    expect(c.transport.destroy).toHaveBeenCalledOnce();
    c.respond(accepted('running'));
    await c.controller.refresh();
    expect(c.controller.snapshot[0]!.state).toBe('processing');
    c.respond(accepted('succeeded'));
    await c.controller.refresh();
    expect(c.controller.snapshot[0]!.state).toBe('ready');
    const count = c.request.mock.calls.length;
    c.controller.clearCompleted();
    expect(c.controller.snapshot).toEqual([]);
    expect(c.request).toHaveBeenCalledTimes(count);
  });
  it('keeps a lost submission response unknown and recovers immutable metadata without retransferring content', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.request.mockRejectedValueOnce(new Error('offline'));
    await c.controller.start('public');
    expect(c.controller.snapshot[0]!.state).toBe('unknown');
    expect(c.controller.snapshot[0]!.error).toContain('offline');
    c.respond(submission());
    await c.controller.refresh();
    expect(c.request.mock.calls[0][1]!.body).toBe(
      c.request.mock.calls[1][1]!.body,
    );
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'unknown',
      sessionId: 'session',
    });
    expect(c.transport.upload).not.toHaveBeenCalled();
    c.respond({ ...queued, state: 'cancelled' });
    await c.controller.cancel(c.controller.snapshot[0]!.id);
    expect(c.controller.snapshot[0]!.state).toBe('cancelled');
  });
  it('distinguishes uncreated upload failure and saved image processing failure', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.transfer.resolve({
      ...queued,
      state: 'failed',
      error: '识别失败',
      cleanupStatus: 'pending',
    });
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'upload-failed',
      imageId: undefined,
      error: '识别失败',
      cleanupStatus: 'pending',
      previewUrl: null,
    });
    c.controller.clearCompleted();
    c.controller.add(c.file);
    c.respond(accepted('failed'), 201);
    await c.controller.start('private');
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'processing-failed',
      imageId: 'real-image',
      step: 'compress',
      error: '压缩失败',
    });
  });
  it('preserves unknown on status read errors and allows successful requery', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.request.mockRejectedValueOnce(new Error('network lost'));
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'unknown',
      sessionId: 'session',
    });
    c.respond(accepted('succeeded'));
    await c.controller.refresh();
    expect(c.controller.snapshot[0]!.state).toBe('ready');
    expect(c.transport.upload).toHaveBeenCalledOnce();
  });
  it('queries the original submission after a content disconnect and never retransmits', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.respond(submission({ state: 'failed', error: '接收已断开' }));
    c.transfer.reject(new Error('XHR disconnected'));
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'upload-failed',
      imageId: undefined,
      previewUrl: null,
      error: '接收已断开',
    });
    expect(c.transport.upload).toHaveBeenCalledOnce();
    expect(c.request.mock.calls[1][0]).toBe(
      '/api/uploads/submissions/submission',
    );
    await c.controller.start('private');
    expect(c.transport.upload).toHaveBeenCalledOnce();
  });
  it('keeps the accepted identity and releases local bytes even if result lookup is unavailable', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.request.mockRejectedValueOnce(new Error('lookup unavailable'));
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'unknown',
      imageId: 'real-image',
      jobId: 'this-job',
      previewUrl: null,
    });
    expect(c.transport.destroy).toHaveBeenCalledOnce();
    const count = c.request.mock.calls.length;
    await c.controller.cancel(c.controller.snapshot[0]!.id);
    expect(c.request).toHaveBeenCalledTimes(count);
  });
  it('cancel 409 preserves the real image ID and reads the winning processing result', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('public');
    await untilTransfer(c);
    c.respond({ message: '已交接', imageId: 'real-image' }, 409);
    c.respond(accepted('running'));
    await c.controller.cancel(c.controller.snapshot[0]!.id);
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'processing',
      imageId: 'real-image',
      cancelling: false,
      previewUrl: null,
    });
    c.respond(accepted('running'));
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(c.controller.snapshot[0]!.state).not.toBe('cancelled');
    const count = c.request.mock.calls.length;
    await c.controller.cancel(c.controller.snapshot[0]!.id);
    expect(c.request).toHaveBeenCalledTimes(count);
  });
  it('cancel winning during transfer prevents its late completion from changing the cancelled result', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.respond({ ...queued, state: 'cancelled', cleanupStatus: 'pending' });
    await c.controller.cancel(c.controller.snapshot[0]!.id);
    c.progress(100);
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'cancelled',
      cleanupStatus: 'pending',
      previewUrl: null,
    });
    expect(c.request).toHaveBeenCalledTimes(2);
  });
  it.each(['ready', 'cancelled'] as const)(
    'ignores late transfer rejection after %s is confirmed',
    async (state) => {
      const c = setup();
      c.controller.add(c.file);
      c.respond(submission(), 201);
      const started = c.controller.start('private');
      await untilTransfer(c);
      if (state === 'ready') {
        c.respond(accepted('succeeded'));
        await c.controller.refresh();
      } else {
        c.respond({ ...queued, state: 'cancelled' });
        await c.controller.cancel(c.controller.snapshot[0]!.id);
      }
      const calls = c.request.mock.calls.length;
      c.transfer.reject(new Error('destroy aborted old XHR'));
      await started;
      expect(c.controller.snapshot[0]).toMatchObject({
        state,
        error: undefined,
      });
      expect(c.request).toHaveBeenCalledTimes(calls);
    },
  );
  it.each(['queued', 'receiving'] as const)(
    'does not let an old %s read erase accepted content identity',
    async (state) => {
      const c = setup();
      c.controller.add(c.file);
      c.respond(submission(), 201);
      const started = c.controller.start('private');
      await untilTransfer(c);
      c.progress(100);
      const staleRead = deferred<Response>();
      c.request.mockReturnValueOnce(staleRead.promise);
      const refreshing = c.controller.refresh();
      c.transfer.resolve({
        ...queued,
        state: 'accepted',
        imageId: 'real-image',
        jobId: 'this-job',
      });
      await started;
      expect(c.controller.snapshot[0]).toMatchObject({
        state: 'processing-queued',
        imageId: 'real-image',
        previewUrl: null,
      });
      staleRead.resolve(
        Response.json(
          submission({ state, queueItemId: c.controller.snapshot[0]!.id }),
        ),
      );
      await refreshing;
      expect(c.controller.snapshot[0]).toMatchObject({
        state: 'processing-queued',
        imageId: 'real-image',
        jobId: 'this-job',
        previewUrl: null,
      });
      c.respond(accepted('succeeded'));
      await c.controller.refresh();
      expect(c.controller.snapshot[0]!.state).toBe('ready');
    },
  );
  it('does not regress a running job when the earlier content acknowledgement arrives late', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.respond(accepted('running'));
    await c.controller.refresh();
    const nextRead = deferred<Response>();
    c.request.mockReturnValueOnce(nextRead.promise);
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await vi.waitFor(() => expect(c.request).toHaveBeenCalledTimes(3));
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'processing',
      imageId: 'real-image',
    });
    const running = accepted('running');
    running.sessions[0].queueItemId = c.controller.snapshot[0]!.id;
    nextRead.resolve(Response.json(running));
    await started;
  });
  it('does not let a read started before cancellation override the confirmed cancelled result', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    const staleRead = deferred<Response>();
    c.request.mockReturnValueOnce(staleRead.promise);
    const refreshing = c.controller.refresh();
    c.respond({ ...queued, state: 'cancelled' });
    await c.controller.cancel(c.controller.snapshot[0]!.id);
    staleRead.resolve(
      Response.json(
        submission({
          state: 'receiving',
          queueItemId: c.controller.snapshot[0]!.id,
        }),
      ),
    );
    await refreshing;
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(c.controller.snapshot[0]!.state).toBe('cancelled');
  });
  it('releases files when metadata is rejected and requires a fresh selection', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond({ message: '存储已停用' }, 409);
    await c.controller.start('public');
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'upload-failed',
      error: '存储已停用',
      previewUrl: null,
    });
    expect(c.transport.destroy).toHaveBeenCalledOnce();
    await c.controller.start('public');
    expect(c.request).toHaveBeenCalledTimes(1);
  });
  it('reports an unavailable current job as unknown rather than perpetual processing', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(
      submission({
        state: 'accepted',
        imageId: 'real-image',
        jobId: 'this-job',
        job: null,
      }),
      201,
    );
    await c.controller.start('private');
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'unknown',
      imageId: 'real-image',
      previewUrl: null,
    });
    expect(c.controller.snapshot[0]!.error).toContain('本次处理任务');
  });
  it('releases files when a recovered metadata request is explicitly rejected', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.request.mockRejectedValueOnce(new Error('lost response'));
    await c.controller.start('private');
    c.respond({ message: '存储不可用' }, 409);
    await c.controller.refresh();
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'upload-failed',
      error: '存储不可用',
      previewUrl: null,
    });
    expect(c.transport.destroy).toHaveBeenCalledOnce();
  });
  it('delegates expired authentication to the page while keeping errors observable', async () => {
    const unauthorized = vi.fn();
    const c = setup(unauthorized);
    c.controller.add(c.file);
    c.respond({ message: '登录已过期' }, 401);
    await c.controller.start('private');
    expect(unauthorized).toHaveBeenCalledOnce();
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'upload-failed',
      error: '登录已过期',
      previewUrl: null,
    });
  });
  it('closing destroys browser references without cancelling server work or restoring a queue', async () => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    c.controller.destroy();
    c.progress(100);
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(c.controller.snapshot).toEqual([]);
    expect(c.transport.destroy).toHaveBeenCalledOnce();
    expect(c.request).toHaveBeenCalledTimes(1);
    expect(setup().controller.snapshot).toEqual([]);
  });
});
