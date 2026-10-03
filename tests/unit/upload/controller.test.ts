import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadController } from '../../../src/components/upload/controller.ts';
import type {
  UploadSessionResult,
  UploadSubmissionResult,
  UploadTransport,
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
    batchSize: 20,
    albumIds: [],
    tagIds: [],
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
  const onLibraryChanged = vi.fn();
  const transfer = deferred<UploadSessionResult>();
  let progress: (value: number) => void = () => {};
  let resubmit: Parameters<UploadTransport['upload']>[3] = async () => {};
  const transport = {
    upload: vi.fn(
      (
        _session: string,
        callback: (value: number) => void,
        _route: Parameters<UploadTransport['upload']>[2],
        onResubmit: Parameters<UploadTransport['upload']>[3],
      ) => {
        progress = callback;
        resubmit = onResubmit;
        return transfer.promise;
      },
    ),
    destroy: vi.fn(),
  };
  const createTransport = vi.fn(() => transport);
  const controller = new UploadController({
    maxFileBytes: 20,
    queueLimit: 500,
    request,
    createTransport,
    onUnauthorized,
    onLibraryChanged,
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
    onLibraryChanged,
    file,
    request,
    transport,
    createTransport,
    transfer,
    progress: (value: number) => progress(value),
    resubmit: (...args: Parameters<typeof resubmit>) => resubmit(...args),
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
    expect(c.controller.add(new File([], 'empty.png'))).toMatchObject({
      reason: 'empty',
    });
    expect(
      c.controller.add(new File(['x'.repeat(21)], 'large.png')),
    ).toMatchObject({ reason: 'size' });
    expect(
      c.controller.add(
        new File(['x'], 'document.pdf', { type: 'application/pdf' }),
      ),
    ).toMatchObject({ reason: 'format' });
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
  it('continues receiving and querying results when the upload view unsubscribes, then exposes the same item on return', async () => {
    const c = setup();
    c.controller.add(c.file);
    const id = c.controller.snapshot[0].id;
    const previewUrl = c.controller.snapshot[0].previewUrl;
    const departed = vi.fn();
    const unsubscribe = c.controller.subscribe(departed);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    unsubscribe();
    departed.mockClear();
    c.progress(70);
    expect(c.controller.snapshot[0]).toMatchObject({
      id,
      progress: 70,
      previewUrl,
    });
    expect(c.transport.destroy).not.toHaveBeenCalled();
    c.respond(accepted('running'));
    c.transfer.resolve({
      ...queued,
      state: 'accepted',
      imageId: 'real-image',
      jobId: 'this-job',
    });
    await started;
    expect(departed).not.toHaveBeenCalled();
    expect(c.controller.snapshot[0]).toMatchObject({
      id,
      imageId: 'real-image',
      state: 'processing',
      previewUrl: null,
    });
    const returned = vi.fn();
    const stop = c.controller.subscribe(returned);
    c.respond(accepted('succeeded'));
    await c.controller.refresh();
    expect(returned).toHaveBeenCalled();
    expect(c.controller.snapshot[0]).toMatchObject({
      id,
      imageId: 'real-image',
      state: 'ready',
    });
    expect(
      c.request.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
    expect(c.transport.upload).toHaveBeenCalledOnce();
    stop();
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

it('notifies library changes only for confirmed new image and processing transitions', async () => {
  const c = setup();
  c.controller.add(c.file);
  c.respond(submission(), 201);
  const started = c.controller.start('private');
  await untilTransfer(c);
  c.progress(100);
  expect(c.onLibraryChanged).not.toHaveBeenCalled();
  c.respond(accepted('queued'));
  c.transfer.resolve(accepted('queued').sessions[0]);
  await started;
  expect(c.onLibraryChanged).toHaveBeenCalledTimes(1);
  c.respond(accepted('queued'));
  await c.controller.refresh();
  expect(c.onLibraryChanged).toHaveBeenCalledTimes(1);
  c.request.mockRejectedValueOnce(new Error('temporary read failure'));
  await c.controller.refresh();
  expect(c.onLibraryChanged).toHaveBeenCalledTimes(1);
  c.respond(accepted('queued'));
  await c.controller.refresh();
  expect(c.onLibraryChanged).toHaveBeenCalledTimes(1);
  c.respond(accepted('running'));
  await c.controller.refresh();
  expect(c.onLibraryChanged).toHaveBeenCalledTimes(2);
  c.respond(accepted('succeeded'));
  await c.controller.refresh();
  expect(c.onLibraryChanged).toHaveBeenCalledTimes(3);
});

it('does not notify for a rejected upload or a cancelled transfer completing late', async () => {
  const rejected = setup();
  rejected.controller.add(rejected.file);
  rejected.respond({ message: 'storage unavailable' }, 409);
  await rejected.controller.start('private');
  expect(rejected.onLibraryChanged).not.toHaveBeenCalled();

  const c = setup();
  c.controller.add(c.file);
  c.respond(submission(), 201);
  const started = c.controller.start('private');
  await untilTransfer(c);
  c.respond({ ...queued, state: 'cancelled' });
  await c.controller.cancel(c.controller.snapshot[0].id);
  c.transfer.resolve(accepted('succeeded').sessions[0]);
  await started;
  expect(c.onLibraryChanged).not.toHaveBeenCalled();
});

it('continues reading a terminal item until its known cleanup responsibility settles', async () => {
  const c = setup();
  c.controller.add(c.file);
  c.respond(submission(), 201);
  const started = c.controller.start('private');
  await untilTransfer(c);
  c.transfer.resolve({
    ...queued,
    state: 'failed',
    cleanupStatus: 'pending',
    error: 'upload failed',
    route: 'direct',
  });
  await started;
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'upload-failed',
    cleanupStatus: 'pending',
    route: 'direct',
    previewUrl: null,
  });
  c.respond(
    submission({
      state: 'failed',
      cleanupStatus: 'failed',
      error: 'known deletion denied',
      route: 'direct',
    }),
  );
  await c.controller.refresh();
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'upload-failed',
    cleanupStatus: 'failed',
  });
  const id = c.controller.snapshot[0].id;
  c.respond({ ...queued, state: 'failed', cleanupStatus: 'none', error: null });
  await c.controller.retryCleanup(id);
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'upload-failed',
    cleanupStatus: 'none',
  });
  expect(c.request.mock.calls.at(-1)).toEqual([
    '/api/uploads/cleanup',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sessionId: 'session' }),
    }),
  ]);
  const requests = c.request.mock.calls.length;
  await c.controller.refresh();
  expect(c.request).toHaveBeenCalledTimes(requests);
});

it.each(['queued', 'running', 'succeeded', 'failed'] as const)(
  'retains accepted cleanup diagnostics separately from %s processing',
  async (status) => {
    const c = setup();
    c.controller.add(c.file);
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    const result = accepted(status).sessions[0];
    result.cleanupStatus = 'failed';
    result.error = 'DeleteObject AccessDenied: uploads/temporary/known.png';
    if (status === 'queued' || status === 'running')
      c.respond({ ...accepted(status), sessions: [result] });
    c.transfer.resolve(result);
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      cleanupStatus: 'failed',
      cleanupError: result.error,
      error: status === 'failed' ? '压缩失败' : undefined,
    });
    c.respond({ ...result, cleanupStatus: 'none', error: null });
    await c.controller.retryCleanup(c.controller.snapshot[0].id);
    expect(c.controller.snapshot[0]).toMatchObject({
      cleanupStatus: 'none',
      cleanupError: undefined,
      error: status === 'failed' ? '压缩失败' : undefined,
    });
  },
);

it('reconciles a failed manual cleanup response and continues reading its new pending cycle', async () => {
  const c = setup();
  c.controller.add(c.file);
  c.respond(submission(), 201);
  const started = c.controller.start('private');
  await untilTransfer(c);
  c.transfer.resolve({
    ...queued,
    state: 'failed',
    cleanupStatus: 'failed',
    error: 'upload rejected\n清理失败: AccessDenied',
  });
  await started;
  c.respond({ message: 'AccessDenied' }, 500);
  c.respond(
    submission({
      state: 'failed',
      cleanupStatus: 'pending',
      error: 'upload rejected\n清理失败: AccessDenied',
    }),
  );
  await expect(
    c.controller.retryCleanup(c.controller.snapshot[0].id),
  ).rejects.toThrow('AccessDenied');
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'upload-failed',
    cleanupStatus: 'pending',
    cleanupError: ' AccessDenied',
  });
  c.respond(
    submission({
      state: 'failed',
      cleanupStatus: 'none',
      error: 'upload rejected',
    }),
  );
  await c.controller.refresh();
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'upload-failed',
    cleanupStatus: 'none',
    cleanupError: undefined,
    error: 'upload rejected',
  });
});

it('moves a signature replacement into its real frozen submission and retains the same transport until acceptance', async () => {
  const c = setup();
  c.controller.add(c.file);
  const id = c.controller.snapshot[0].id;
  const preview = c.controller.snapshot[0].previewUrl;
  c.respond(submission(), 201);
  const started = c.controller.start('private', 'local', {
    albumIds: [],
    tagIds: [],
    labels: {
      storageId: 'local',
      storageName: 'Frozen storage',
      albums: [],
      tags: [],
    },
  });
  await untilTransfer(c);
  const metadata = deferred<UploadSubmissionResult>();
  const replacing = c.resubmit(
    'same-resubmit-request',
    'session',
    metadata.promise,
  );
  const replacement = {
    ...submission({ id: 'new-session', queueItemId: id }),
    id: 'new-submission',
  };
  metadata.resolve(replacement);
  await replacing;
  expect(c.controller.snapshot[0]).toMatchObject({
    id,
    previewUrl: preview,
    sessionId: 'new-session',
    submissionId: 'new-submission',
    state: 'uploading',
    frozenSubmission: {
      id: 'new-submission',
      number: 2,
      count: 1,
      storageName: 'Frozen storage',
    },
  });
  c.respond({
    ...replacement,
    sessions: [
      {
        ...accepted('succeeded').sessions[0],
        id: 'new-session',
        queueItemId: id,
      },
    ],
  });
  c.transfer.resolve({
    ...accepted('queued').sessions[0],
    id: 'new-session',
    queueItemId: id,
  });
  await started;
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'ready',
    sessionId: 'new-session',
    imageId: 'real-image',
    previewUrl: null,
  });
  expect(c.request.mock.calls.at(-1)?.[0]).toBe(
    '/api/uploads/submissions/new-submission',
  );
  expect(c.createTransport).toHaveBeenCalledOnce();
  expect(c.transport.upload).toHaveBeenCalledOnce();
});

it('recovers a lost resubmit response with the same metadata request instead of sending the file again', async () => {
  const c = setup();
  c.controller.add(c.file);
  c.respond(submission(), 201);
  const started = c.controller.start('private');
  await untilTransfer(c);
  const replacing = c.resubmit(
    'same-resubmit-request',
    'session',
    Promise.reject(new Error('resubmit response lost')),
  );
  await expect(replacing).rejects.toThrow('resubmit response lost');
  c.respond(
    { ...submission({ id: 'new-session' }), id: 'new-submission' },
    201,
  );
  c.transfer.reject(new Error('resubmit response lost'));
  await started;
  expect(c.request.mock.calls.at(-1)).toEqual([
    '/api/uploads/sessions/session/resubmit',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ requestId: 'same-resubmit-request' }),
    }),
  ]);
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'unknown',
    sessionId: 'new-session',
    submissionId: 'new-submission',
  });
  expect(c.transport.upload).toHaveBeenCalledOnce();
  expect(c.createTransport).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'cancels the replacement session after settling resubmit metadata (lost=%s)',
  async (lost) => {
    const c = setup();
    c.controller.add(c.file);
    const queueItemId = c.controller.snapshot[0].id;
    c.respond(submission(), 201);
    const started = c.controller.start('private');
    await untilTransfer(c);
    const metadata = deferred<UploadSubmissionResult>();
    const replacing = c.resubmit(
      'cancel-resubmit',
      'session',
      metadata.promise,
    );
    const outcome = replacing.catch(() => {});
    const replacement = {
      ...submission({ id: 'new-session', queueItemId }),
      id: 'new-submission',
    };
    if (lost) c.respond(replacement, 201);
    c.respond({ ...queued, id: 'new-session', state: 'cancelled' });
    const cancelled = c.controller.cancel(queueItemId);
    if (lost) metadata.reject(new TypeError('resubmit response lost'));
    else metadata.resolve(replacement);
    await outcome;
    await cancelled;
    c.transfer.resolve({
      ...accepted('succeeded').sessions[0],
      id: 'new-session',
    });
    await started;
    expect(c.controller.snapshot[0]).toMatchObject({
      state: 'cancelled',
      sessionId: 'new-session',
      submissionId: 'new-submission',
      imageId: undefined,
    });
    const deletes = c.request.mock.calls.filter(
      ([, init]) => init?.method === 'DELETE',
    );
    expect(deletes).toEqual([
      ['/api/uploads/sessions/new-session', expect.any(Object)],
    ]);
    if (lost)
      expect(
        c.request.mock.calls.some(
          ([url, init]) =>
            url === '/api/uploads/sessions/session/resubmit' &&
            init?.body === JSON.stringify({ requestId: 'cancel-resubmit' }),
        ),
      ).toBe(true);
    expect(c.transport.destroy).toHaveBeenCalledOnce();
    expect(c.transport.upload).toHaveBeenCalledOnce();
  },
);

it('keeps an accepted replacement observable when its cancellation returns imageId conflict', async () => {
  const c = setup();
  c.controller.add(c.file);
  const queueItemId = c.controller.snapshot[0].id;
  c.respond(submission(), 201);
  const started = c.controller.start('private');
  await untilTransfer(c);
  const metadata = deferred<UploadSubmissionResult>();
  const replacing = c.resubmit('cancel-resubmit', 'session', metadata.promise);
  c.respond({ message: 'already accepted', imageId: 'real-image' }, 409);
  c.respond({
    ...accepted('succeeded'),
    id: 'new-submission',
    sessions: [
      { ...accepted('succeeded').sessions[0], id: 'new-session', queueItemId },
    ],
  });
  const cancelled = c.controller.cancel(queueItemId);
  metadata.resolve({
    ...submission({ id: 'new-session', queueItemId }),
    id: 'new-submission',
  });
  await replacing;
  await cancelled;
  c.transfer.resolve({
    ...accepted('succeeded').sessions[0],
    id: 'new-session',
  });
  await started;
  expect(c.controller.snapshot[0]).toMatchObject({
    state: 'ready',
    sessionId: 'new-session',
    submissionId: 'new-submission',
    imageId: 'real-image',
  });
  expect(
    c.request.mock.calls.find(([, init]) => init?.method === 'DELETE')?.[0],
  ).toBe('/api/uploads/sessions/new-session');
});
