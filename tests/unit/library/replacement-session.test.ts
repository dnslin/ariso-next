import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReplacementSession } from '../../../src/components/library/replacement-session';

class Upload {
  static current: Upload;
  static instances: Upload[] = [];
  upload: {
    onprogress:
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  status = 0;
  responseText = '';
  body: FormData | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    Upload.current = this;
    Upload.instances.push(this);
  }
  open = vi.fn();
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  complete(status: number, value: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(value);
    this.onload?.();
  }
}
const fetcher = vi.fn();
const completed = vi.fn();
const expired = vi.fn();
const backgroundError = vi.fn();
let session: ReplacementSession;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fetcher.mockReset();
  completed.mockReset();
  expired.mockReset();
  backgroundError.mockReset();
  Upload.instances = [];
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('XMLHttpRequest', Upload);
  session = new ReplacementSession(
    'image',
    completed,
    expired,
    backgroundError,
  );
});
afterEach(() => {
  session.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const available = { unavailableReason: null, job: null };
async function ready() {
  fetcher.mockResolvedValueOnce(Response.json(available));
  await session.start();
  const file = new File(['new image bytes'], 'new.png', { type: 'image/png' });
  const submission = session.choose(file);
  expect(Upload.instances).toHaveLength(1);
  return { file, submission };
}

it('automatically submits exactly one selected file without a separate confirmation action', async () => {
  fetcher.mockResolvedValueOnce(Response.json(available));
  await session.start();
  const file = new File(['bytes'], 'new.png');
  const submission = session.choose(file);
  expect(Upload.instances).toHaveLength(1);
  expect(Upload.current.body?.get('file')).toBeInstanceOf(File);
  expect(Upload.current.body?.get('file')).toBe(file);
  expect([...Upload.current.body!.keys()]).toEqual(['file']);
  expect(Upload.current.open).toHaveBeenCalledWith(
    'POST',
    '/api/images/image/replace',
  );
  Upload.current.upload.onprogress?.({
    lengthComputable: true,
    loaded: 30,
    total: 100,
  });
  expect(session.getSnapshot()).toMatchObject({
    uploading: true,
    progress: 30,
    transferComplete: false,
  });
  Upload.current.upload.onload?.();
  expect(session.getSnapshot().transferComplete).toBe(true);
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'job-1',
    status: 'queued',
    byteSize: 5,
  });
  await submission;
  expect(session.getSnapshot().job).toMatchObject({
    id: 'job-1',
    status: 'queued',
  });
  expect(completed).not.toHaveBeenCalled();
});

it('leaves the current image unchanged and sends no request for a cancelled chooser', async () => {
  fetcher.mockResolvedValueOnce(Response.json(available));
  await session.start();
  const snapshot = session.getSnapshot();
  await session.choose(null);
  expect(Upload.instances).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot()).toEqual(snapshot);
  expect(completed).not.toHaveBeenCalled();
});

it('shows the actual qualification refusal after selection without sending a file', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({ unavailableReason: '当前图片已有活动内容任务', job: null }),
  );
  await session.start();
  await session.choose(new File(['chosen'], 'chosen.png'));
  expect(session.getSnapshot()).toMatchObject({
    error: '当前图片已有活动内容任务',
    selecting: false,
    uploading: false,
  });
  expect(Upload.instances).toHaveLength(0);
  expect(completed).not.toHaveBeenCalled();
});

it('exposes the selected-file qualification handoff and sends only that file when a second selection is attempted', async () => {
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const initial = session.start();
  const firstFile = new File(['first selection'], 'first.png');
  const first = session.choose(firstFile);
  expect(session.getSnapshot()).toMatchObject({
    selecting: true,
    checking: true,
    uploading: false,
  });
  await session.choose(new File(['second selection'], 'second.png'));
  expect(Upload.instances).toHaveLength(0);
  resolve(Response.json(available));
  await initial;
  expect(Upload.instances).toHaveLength(1);
  expect(Upload.current.body?.get('file')).toBe(firstFile);
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'first-selected-file',
    status: 'queued',
    byteSize: firstFile.size,
  });
  await first;
  expect(session.getSnapshot().selecting).toBe(false);
  expect(Upload.instances).toHaveLength(1);
});

it('keeps the actual rejected-upload error until another file is selected and never retries by itself', async () => {
  const { submission } = await ready();
  fetcher.mockResolvedValueOnce(Response.json(available));
  Upload.current.complete(422, { message: '替换图片格式无法识别' });
  await submission;
  expect(session.getSnapshot()).toMatchObject({
    uploading: false,
    error: '替换图片格式无法识别',
    job: null,
  });
  const rejected = session.getSnapshot();
  await session.choose(null);
  expect(session.getSnapshot()).toEqual(rejected);
  expect(Upload.instances).toHaveLength(1);
  expect(completed).not.toHaveBeenCalled();

  const file = new File(['corrected image'], 'corrected.png');
  const retry = session.choose(file);
  expect(Upload.instances).toHaveLength(2);
  expect(Upload.current.body?.get('file')).toBe(file);
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'corrected',
    status: 'queued',
    byteSize: file.size,
  });
  await retry;
  expect(session.getSnapshot().error).toBe('');
  expect(completed).not.toHaveBeenCalled();
});

it('waits for publication after queued and running size generation instead of treating upload acceptance as completion', async () => {
  const { submission } = await ready();
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'atomic-publication',
    status: 'queued',
    byteSize: 15,
  });
  await submission;
  expect(completed).not.toHaveBeenCalled();
  for (const step of ['compressed', 'thumbnail', 'watermark', 'sizes']) {
    fetcher.mockResolvedValueOnce(
      Response.json({
        unavailableReason: '图片已有活动内容任务',
        job: {
          id: 'atomic-publication',
          status: 'running',
          step,
          error: null,
          finishedAt: null,
        },
      }),
    );
    await session.read();
    expect(session.getSnapshot().job).toMatchObject({
      id: 'atomic-publication',
      status: 'running',
      step,
    });
    expect(completed).not.toHaveBeenCalled();
    expect(Upload.instances).toHaveLength(1);
  }
});
it('reads back a lost upload response instead of resubmitting, then reports completion once the job succeeds', async () => {
  const { submission } = await ready();
  fetcher.mockResolvedValueOnce(
    Response.json({
      unavailableReason: '已有任务',
      job: {
        id: 'job-2',
        status: 'running',
        step: 'compressed',
        error: null,
        finishedAt: null,
      },
    }),
  );
  Upload.current.onerror?.();
  await submission;
  expect(session.getSnapshot()).toMatchObject({
    unknown: false,
    error: '',
    job: { id: 'job-2', status: 'running' },
  });
  const done = {
    unavailableReason: null,
    job: {
      id: 'job-2',
      status: 'succeeded',
      step: 'complete',
      error: null,
      finishedAt: '2026-10-21T00:00:00Z',
    },
  };
  fetcher.mockResolvedValueOnce(Response.json(done));
  await session.read();
  fetcher.mockResolvedValueOnce(Response.json(done));
  await session.read();
  expect(completed).toHaveBeenCalledTimes(1);
});
it('retains the real processing failure without reporting success or automatically resubmitting', async () => {
  const { submission } = await ready();
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'job-3',
    status: 'queued',
    byteSize: 15,
  });
  await submission;
  fetcher.mockResolvedValueOnce(
    Response.json({
      unavailableReason: null,
      job: {
        id: 'job-3',
        status: 'failed',
        step: 'watermark',
        error: '水印生成失败',
        finishedAt: '2026-10-21T00:00:00Z',
      },
    }),
  );
  await session.read();
  expect(session.getSnapshot()).toMatchObject({
    job: { status: 'failed', error: '水印生成失败' },
  });
  expect(Upload.instances).toHaveLength(1);
  expect(completed).not.toHaveBeenCalled();
});

it('treats an existing successful history as history so reopening can submit another replacement', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({
      unavailableReason: null,
      job: {
        id: 'historical-success',
        status: 'succeeded',
        step: 'complete',
        error: null,
        finishedAt: '2026-10-20T00:00:00Z',
      },
    }),
  );
  await session.start();
  expect(session.getSnapshot().job).toBeNull();
  expect(completed).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(Response.json(session.getSnapshot().setup));
  await session.read();
  expect(session.getSnapshot().job).toBeNull();
  expect(completed).not.toHaveBeenCalled();
  expect(Upload.instances).toHaveLength(0);
  const submission = session.choose(new File(['another image'], 'another.png'));
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'new-attempt',
    status: 'queued',
    byteSize: 13,
  });
  await submission;
  expect(session.getSnapshot().job).toMatchObject({
    id: 'new-attempt',
    status: 'queued',
  });
});

it.each(['failed', 'cancelled'] as const)(
  'shows the actual background %s task after closing and reopening details without mistaking it for success',
  async (status) => {
    const { submission } = await ready();
    Upload.current.complete(202, {
      imageId: 'image',
      jobId: 'closed-after-acceptance',
      status: 'queued',
      byteSize: 15,
    });
    await submission;
    session.stop();
    session = new ReplacementSession(
      'image',
      completed,
      expired,
      backgroundError,
    );
    const job = {
      id: 'closed-after-acceptance',
      status,
      step: 'watermark',
      error: status === 'failed' ? '后台候选水印生成失败' : null,
      finishedAt: '2026-10-21T00:00:00Z',
    };
    fetcher.mockResolvedValueOnce(
      Response.json({ unavailableReason: null, job }),
    );
    await session.start();
    expect(session.getSnapshot().job).toEqual(job);
    expect(completed).not.toHaveBeenCalled();
    expect(Upload.instances).toHaveLength(1);

    const terminal = session.getSnapshot();
    await session.choose(null);
    expect(session.getSnapshot()).toEqual(terminal);
    const next = session.choose(new File(['another selection'], 'another.png'));
    expect(Upload.instances).toHaveLength(2);
    expect(session.getSnapshot().job).toBeNull();
    Upload.current.complete(202, {
      imageId: 'image',
      jobId: 'new-selection-after-terminal',
      status: 'queued',
      byteSize: 17,
    });
    await next;
    expect(session.getSnapshot().job).toMatchObject({
      id: 'new-selection-after-terminal',
      status: 'queued',
    });
    expect(completed).not.toHaveBeenCalled();
  },
);

it('allows choosing another file after this session succeeds without presenting the old success as the new attempt', async () => {
  const { submission: first } = await ready();
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'first',
    status: 'queued',
    byteSize: 15,
  });
  await first;
  fetcher.mockResolvedValueOnce(
    Response.json({
      unavailableReason: null,
      job: {
        id: 'first',
        status: 'succeeded',
        step: 'complete',
        error: null,
        finishedAt: '2026-10-21T00:00:00Z',
      },
    }),
  );
  await session.read();
  expect(completed).toHaveBeenCalledOnce();
  const second = session.choose(new File(['second bytes'], 'second.png'));
  expect(session.getSnapshot().job).toBeNull();
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'second',
    status: 'queued',
    byteSize: 12,
  });
  await second;
  expect(session.getSnapshot().job).toMatchObject({
    id: 'second',
    status: 'queued',
  });
});
it('does not start duplicate submissions while sending or waiting for the accepted task', async () => {
  const { submission, file } = await ready();
  await session.choose(new File(['duplicate'], 'duplicate.png'));
  expect(Upload.instances).toHaveLength(1);
  expect(Upload.current.body?.get('file')).toBe(file);
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'job-4',
    status: 'queued',
    byteSize: 15,
  });
  await submission;
  await session.choose(new File(['queued duplicate'], 'queued.png'));
  expect(Upload.instances).toHaveLength(1);
});

it('finishes the same upload after closing details without aborting or sending it again', async () => {
  const { submission } = await ready();
  const upload = Upload.current;
  const abort = vi.spyOn(upload, 'abort');
  session.stop();
  expect(abort).not.toHaveBeenCalled();
  upload.complete(202, {
    imageId: 'image',
    jobId: 'background-accepted',
    status: 'queued',
    byteSize: 15,
  });
  await submission;
  expect(Upload.instances).toHaveLength(1);
  expect(completed).not.toHaveBeenCalled();
  expect(backgroundError).not.toHaveBeenCalled();
});

it('forwards the actual upload failure after closing details to visible background feedback', async () => {
  const { submission } = await ready();
  const upload = Upload.current;
  const abort = vi.spyOn(upload, 'abort');
  session.stop();
  expect(abort).not.toHaveBeenCalled();
  upload.complete(422, { message: '后台替换图片无法识别' });
  await submission;
  expect(backgroundError).toHaveBeenCalledExactlyOnceWith(
    '后台替换图片无法识别',
  );
  expect(completed).not.toHaveBeenCalled();
  expect(Upload.instances).toHaveLength(1);
});

it('keeps a selected replacement through a pending qualification read when details close', async () => {
  fetcher.mockResolvedValueOnce(Response.json(available));
  await session.start();
  let resolve!: (value: Response) => void;
  fetcher.mockReturnValueOnce(
    new Promise<Response>((done) => (resolve = done)),
  );
  const read = session.read();
  const signal = fetcher.mock.calls.at(-1)![1].signal as AbortSignal;
  const file = new File(['selected before close'], 'selected.png');
  const submission = session.choose(file);
  session.stop();
  expect(signal.aborted).toBe(false);
  resolve(Response.json(available));
  await read;
  expect(Upload.instances).toHaveLength(1);
  expect(Upload.current.body?.get('file')).toBe(file);
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'selected-before-close',
    status: 'queued',
    byteSize: file.size,
  });
  await submission;
  expect(backgroundError).not.toHaveBeenCalled();
  expect(completed).not.toHaveBeenCalled();
  await session.choose(new File(['after close'], 'too-late.png'));
  expect(Upload.instances).toHaveLength(1);
});

it.each(['read-error', 'unavailable'] as const)(
  'reports %s after the chosen replacement outlives its detail without sending a POST',
  async (result) => {
    fetcher.mockResolvedValueOnce(Response.json(available));
    await session.start();
    let resolve!: (value: Response) => void;
    let reject!: (error: Error) => void;
    fetcher.mockReturnValueOnce(
      new Promise<Response>((done, fail) => {
        resolve = done;
        reject = fail;
      }),
    );
    const read = session.read();
    const signal = fetcher.mock.calls.at(-1)![1].signal as AbortSignal;
    const submission = session.choose(new File(['chosen'], 'chosen.png'));
    session.stop();
    expect(signal.aborted).toBe(false);
    const message =
      result === 'read-error' ? '资格读取连接实际中断' : '存储已停用';
    if (result === 'read-error') reject(new Error(message));
    else resolve(Response.json({ unavailableReason: message, job: null }));
    await Promise.all([read, submission]);
    expect(Upload.instances).toHaveLength(0);
    expect(backgroundError).toHaveBeenCalledExactlyOnceWith(message);
    expect(completed).not.toHaveBeenCalled();
  },
);
it('clears private drafts on owner expiry and never turns a queued receipt into a completed replacement', async () => {
  const { submission } = await ready();
  Upload.current.complete(401, { message: '请先登录' });
  await submission;
  expect(session.getSnapshot()).toMatchObject({ setup: null, job: null });
  expect(expired).toHaveBeenCalledOnce();
  expect(completed).not.toHaveBeenCalled();
});

it.each(['succeeded', 'failed', 'cancelled'] as const)(
  'clears the receiving acknowledgement when the replacement becomes %s',
  async (status) => {
    const { submission: submitted } = await ready();
    Upload.current.complete(202, {
      imageId: 'image',
      jobId: 'terminal-job',
      status: 'queued',
      byteSize: 5,
    });
    await submitted;
    expect(completed).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(
      Response.json({
        unavailableReason: null,
        job: {
          id: 'terminal-job',
          status,
          step: 'complete',
          error: status === 'succeeded' ? null : 'Replacement did not publish',
          finishedAt: '2026-10-21T00:00:00Z',
        },
      }),
    );
    await session.read();
    expect(session.getSnapshot().job?.status).toBe(status);
    expect(completed).toHaveBeenCalledTimes(status === 'succeeded' ? 1 : 0);
  },
);

it.each(['succeeded', 'failed', 'cancelled'] as const)(
  'clears the uncertain transfer error when readback confirms the current job is %s',
  async (status) => {
    const { submission: submitted } = await ready();
    const error = status === 'succeeded' ? null : '候选版本未发布';
    fetcher.mockResolvedValueOnce(
      Response.json({
        unavailableReason: null,
        job: {
          id: 'confirmed-after-lost-response',
          status,
          step: 'complete',
          error,
          finishedAt: '2026-10-21T00:00:00Z',
        },
      }),
    );
    Upload.current.onerror?.();
    await submitted;
    expect(session.getSnapshot()).toMatchObject({
      uploading: false,
      unknown: false,
      error: '',
      job: { id: 'confirmed-after-lost-response', status, error },
    });
    expect(completed).toHaveBeenCalledTimes(status === 'succeeded' ? 1 : 0);
  },
);

it.each([
  null,
  {
    id: 'previous-success',
    status: 'succeeded' as const,
    step: 'complete',
    error: null,
    finishedAt: '2026-10-20T00:00:00Z',
  },
  ...(['failed', 'cancelled'] as const).map((status) => ({
    id: `previous-${status}`,
    status,
    step: 'watermark',
    error: status === 'failed' ? '旧替换任务失败' : null,
    finishedAt: '2026-10-20T00:00:00Z',
  })),
])(
  'keeps the transfer error when readback finds no new job beyond %j',
  async (job) => {
    const setup = { unavailableReason: null, job };
    fetcher.mockResolvedValueOnce(Response.json(setup));
    await session.start();
    const submitted = session.choose(new File(['new bytes'], 'new.png'));
    fetcher.mockResolvedValueOnce(Response.json(setup));
    Upload.current.onerror?.();
    await submitted;
    expect(session.getSnapshot()).toMatchObject({
      job: null,
      unknown: false,
      error: '连接中断，替换请求结果待核对。',
    });
    expect(completed).not.toHaveBeenCalled();
  },
);
