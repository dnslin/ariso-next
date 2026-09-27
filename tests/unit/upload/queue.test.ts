import { afterEach, expect, it, vi } from 'vitest';
import { UploadController } from '../../../src/components/upload/controller.ts';
import type {
  UploadSessionResult,
  UploadSubmissionResult,
} from '../../../src/components/upload/types.ts';
const controllers: UploadController[] = [];
afterEach(() => {
  controllers.forEach((controller) => controller.destroy());
  controllers.length = 0;
  vi.restoreAllMocks();
});
function setup(batchSize = 20, queueLimit = 20) {
  const batches: UploadSubmissionResult[] = [];
  const transports: {
    upload: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    resolve: (value: UploadSessionResult) => void;
    reject: (error: Error) => void;
  }[] = [];
  let active = 0,
    peak = 0;
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (init?.method === 'POST') {
      const input = JSON.parse(init.body as string);
      const batch: UploadSubmissionResult = {
        id: `batch-${batches.length}`,
        storageId: 'local',
        visibility: input.visibility,
        sessions: input.files.map(
          (file: { queueItemId: string }, index: number) => ({
            id: `${batches.length}-${index}`,
            queueItemId: file.queueItemId,
            groupIndex: Math.floor(index / batchSize),
            state: 'queued',
            imageId: null,
            jobId: null,
            cleanupStatus: 'none',
            error: null,
          }),
        ),
      };
      batches.push(batch);
      return Response.json(batch);
    }
    if (init?.method === 'DELETE') {
      const session = batches
        .flatMap((batch) => batch.sessions)
        .find((session) => String(url).endsWith(session.id))!;
      session.state = 'cancelled';
      return Response.json(session);
    }
    return Response.json(
      batches.find((batch) => String(url).endsWith(batch.id)),
    );
  });
  const controller = new UploadController({
    maxFileBytes: 100,
    queueLimit,
    request,
    createTransport: () => {
      let resolve!: (value: UploadSessionResult) => void,
        reject!: (error: Error) => void;
      const promise = new Promise<UploadSessionResult>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const transport = {
        upload: vi.fn(() => {
          active++;
          peak = Math.max(peak, active);
          return promise.finally(() => active--);
        }),
        destroy: vi.fn(),
        resolve,
        reject,
      };
      transports.push(transport);
      return transport;
    },
  });
  controllers.push(controller);
  const add = (count: number) => {
    for (let i = 0; i < count; i++)
      expect(controller.add(new File(['x'], `photo-${i}.png`))).toBeNull();
  };
  const settle = (index: number, state: 'accepted' | 'failed' = 'accepted') => {
    const session = batches
      .flatMap((batch) => batch.sessions)
      .find(
        (session) => session.queueItemId === controller.snapshot[index].id,
      )!;
    Object.assign(session, {
      state,
      imageId: state === 'accepted' ? `image-${index}` : null,
      jobId: state === 'accepted' ? `job-${index}` : null,
      ...(state === 'accepted'
        ? {
            job: {
              id: `job-${index}`,
              status: 'running',
              step: 'compress',
              error: null,
            },
          }
        : { error: 'invalid image' }),
    });
    transports[index].resolve({ ...session });
  };
  return {
    controller,
    request,
    batches,
    transports,
    add,
    settle,
    peak: () => peak,
  };
}
it('freezes a shared submission, leaves additions for next start and shares three slots across submissions', async () => {
  const c = setup();
  c.add(2);
  const first = c.controller.start('private');
  await vi.waitFor(() => expect(c.transports[1].upload).toHaveBeenCalledOnce());
  c.add(3);
  expect(
    c.controller.snapshot.slice(2).every((item) => item.state === 'queued'),
  ).toBe(true);
  expect(
    c.request.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(1);
  const second = c.controller.start('public');
  await vi.waitFor(() => expect(c.transports[2].upload).toHaveBeenCalledOnce());
  expect(c.transports[3].upload).not.toHaveBeenCalled();
  expect(c.peak()).toBe(3);
  expect(
    c.batches.map((batch) => [batch.visibility, batch.sessions.length]),
  ).toEqual([
    ['private', 2],
    ['public', 3],
  ]);
  c.settle(0);
  await vi.waitFor(() => expect(c.transports[3].upload).toHaveBeenCalledOnce());
  c.settle(1);
  await vi.waitFor(() => expect(c.transports[4].upload).toHaveBeenCalledOnce());
  c.settle(2);
  c.settle(3);
  c.settle(4);
  await Promise.all([first, second]);
  expect(c.peak()).toBe(3);
  expect(
    c.controller.snapshot.every((item) => item.state === 'processing'),
  ).toBe(true);
  c.controller.clearCompleted();
  expect(c.controller.snapshot).toHaveLength(5);
  c.request.mockClear();
  await c.controller.refresh();
  expect(c.request).toHaveBeenCalledTimes(2);
});
it('advances groups after accepted/failed/cancelled receipt, without waiting for media jobs', async () => {
  const c = setup(3);
  c.add(4);
  const started = c.controller.start('private');
  await vi.waitFor(() => expect(c.transports[2].upload).toHaveBeenCalledOnce());
  c.settle(0);
  c.settle(1, 'failed');
  await c.controller.cancel(c.controller.snapshot[2].id);
  c.transports[2].reject(new Error('cancelled XHR'));
  await vi.waitFor(() => expect(c.transports[3].upload).toHaveBeenCalledOnce());
  expect(c.controller.snapshot[0].state).toBe('processing');
  c.settle(3);
  await started;
  c.controller.clearCompleted();
  expect(c.controller.snapshot.map((item) => item.state)).toEqual([
    'processing',
    'processing',
  ]);
});
it('counts terminal rows against the real queue limit and releases every browser resource on destroy', async () => {
  const c = setup(20, 2);
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  c.add(2);
  expect(c.controller.add(new File(['x'], 'extra.png'))).toContain('上限');
  const started = c.controller.start('private');
  await vi.waitFor(() => expect(c.transports[1].upload).toHaveBeenCalledOnce());
  c.settle(0, 'failed');
  await vi.waitFor(() =>
    expect(c.controller.snapshot[0].state).toBe('upload-failed'),
  );
  expect(c.controller.add(new File(['x'], 'extra.png'))).toContain('上限');
  c.controller.clearCompleted();
  c.add(1);
  expect(c.controller.snapshot.map((item) => item.state)).toEqual([
    'uploading',
    'queued',
  ]);
  c.controller.destroy();
  c.transports[1].reject(new Error('aborted'));
  await started;
  expect(c.controller.snapshot).toEqual([]);
  expect(revoke).toHaveBeenCalledTimes(3);
  c.transports.forEach((transport) =>
    expect(transport.destroy).toHaveBeenCalledOnce(),
  );
  expect(
    c.request.mock.calls.some(([, init]) => init?.method === 'DELETE'),
  ).toBe(false);
  expect(c.request.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
it('keeps unsent admitted files eligible through an unavailable poll while unresolved receipt blocks only its later group', async () => {
  const c = setup(2);
  c.add(3);
  const started = c.controller.start('private');
  await vi.waitFor(() => expect(c.transports[1].upload).toHaveBeenCalledOnce());
  c.request.mockRejectedValueOnce(new Error('poll offline'));
  await c.controller.refresh();
  expect(c.controller.snapshot.map((item) => item.state)).toEqual([
    'uploading',
    'uploading',
    'waiting-upload',
  ]);
  c.settle(0, 'failed');
  c.transports[1].reject(new Error('receipt unknown'));
  await started;
  expect(c.controller.snapshot[1].state).toBe('unknown');
  expect(c.transports[2].upload).not.toHaveBeenCalled();
  await c.controller.cancel(c.controller.snapshot[1].id);
  await vi.waitFor(() => expect(c.transports[2].upload).toHaveBeenCalledOnce());
  expect(c.controller.snapshot[0].state).toBe('upload-failed');
  expect(c.controller.snapshot[1].state).toBe('cancelled');
  c.settle(2);
  await vi.waitFor(() =>
    expect(c.controller.snapshot[2].state).toBe('processing'),
  );
  c.transports.forEach((transport) =>
    expect(transport.upload).toHaveBeenCalledOnce(),
  );
});
it('merges overlapping item queries into one submission read without losing per-file identity', async () => {
  const c = setup();
  c.add(2);
  const started = c.controller.start('private');
  await vi.waitFor(() => expect(c.transports[1].upload).toHaveBeenCalledOnce());
  let respond!: (response: Response) => void;
  c.request.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  const first = c.controller.refresh(c.controller.snapshot[0].id);
  await c.controller.refresh(c.controller.snapshot[1].id);
  expect(c.request).toHaveBeenCalledTimes(2);
  // A content response arriving after this read must survive its older queued state.
  const old = structuredClone(c.batches[0]);
  c.settle(0);
  await vi.waitFor(() =>
    expect(c.controller.snapshot[0].imageId).toBe('image-0'),
  );
  respond(Response.json(old));
  await first;
  expect(c.controller.snapshot[0].imageId).toBe('image-0');
  c.settle(1);
  await started;
  expect(c.controller.snapshot.map((item) => item.imageId)).toEqual([
    'image-0',
    'image-1',
  ]);
});
