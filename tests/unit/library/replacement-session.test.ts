import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReplacementSession } from '../../../src/components/library/replacement-session';

class Upload {
  static current: Upload;
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
let session: ReplacementSession;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fetcher.mockReset();
  completed.mockReset();
  expired.mockReset();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('XMLHttpRequest', Upload);
  session = new ReplacementSession('image', completed, expired);
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
  session.choose(
    new File(['new image bytes'], 'new.png', { type: 'image/png' }),
  );
}

it('sends one selected file only after the explicit submit action, without an additional confirmation checkbox', async () => {
  fetcher.mockResolvedValueOnce(Response.json(available));
  await session.start();
  await session.submit();
  expect(Upload.current?.body ?? null).toBeNull();
  session.choose(new File(['bytes'], 'new.png'));
  const submission = session.submit();
  expect(Upload.current.body?.get('file')).toBeInstanceOf(File);
  expect([...Upload.current.body!.keys()]).toEqual(['file']);
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
it('reads back a lost upload response instead of resubmitting, then reports completion once the job succeeds', async () => {
  await ready();
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
  const submission = session.submit();
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
it('keeps the file when processing fails so an explicit retry can use the same selection', async () => {
  await ready();
  const file = session.getSnapshot().file;
  const submission = session.submit();
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
    file,
    job: { status: 'failed', error: '水印生成失败' },
  });
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
  session.choose(new File(['another image'], 'another.png'));
  const submission = session.submit();
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

it('allows choosing another file after this session succeeds without presenting the old success as the new attempt', async () => {
  await ready();
  const first = session.submit();
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
  session.choose(new File(['second bytes'], 'second.png'));
  expect(session.getSnapshot().job).toBeNull();
  const second = session.submit();
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
it('cancels only a transfer still sending and reconciles server state after cancellation', async () => {
  await ready();
  fetcher.mockResolvedValueOnce(Response.json(available));
  const submission = session.submit();
  session.cancelUpload();
  await submission;
  expect(session.getSnapshot()).toMatchObject({
    uploading: false,
    unknown: false,
    job: null,
  });
  const another = session.submit();
  Upload.current.upload.onload?.();
  session.cancelUpload();
  expect(session.getSnapshot().uploading).toBe(true);
  Upload.current.complete(202, {
    imageId: 'image',
    jobId: 'job-4',
    status: 'queued',
    byteSize: 15,
  });
  await another;
});
it('clears private drafts on owner expiry and never turns a queued receipt into a completed replacement', async () => {
  await ready();
  const submission = session.submit();
  Upload.current.complete(401, { message: '请先登录' });
  await submission;
  expect(session.getSnapshot().file).toBeNull();
  expect(expired).toHaveBeenCalledOnce();
  expect(completed).not.toHaveBeenCalled();
});

it.each(['succeeded', 'failed', 'cancelled'] as const)(
  'clears the receiving acknowledgement when the replacement becomes %s',
  async (status) => {
    await ready();
    const submitted = session.submit();
    Upload.current.complete(202, {
      imageId: 'image',
      jobId: 'terminal-job',
      status: 'queued',
      byteSize: 5,
    });
    await submitted;
    expect(session.getSnapshot().message).toContain('正在准备候选版本');
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
    expect(session.getSnapshot().message).toBe('');
  },
);

it.each(['succeeded', 'failed', 'cancelled'] as const)(
  'clears the uncertain transfer error when readback confirms the current job is %s',
  async (status) => {
    await ready();
    const file = session.getSnapshot().file;
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
    const submitted = session.submit();
    Upload.current.onerror?.();
    await submitted;
    expect(session.getSnapshot()).toMatchObject({
      file,
      uploading: false,
      unknown: false,
      error: '',
      message: '',
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
])(
  'keeps the transfer error when readback finds no new job beyond %j',
  async (job) => {
    const setup = { unavailableReason: null, job };
    fetcher.mockResolvedValueOnce(Response.json(setup));
    await session.start();
    session.choose(new File(['new bytes'], 'new.png'));
    const file = session.getSnapshot().file;
    fetcher.mockResolvedValueOnce(Response.json(setup));
    const submitted = session.submit();
    Upload.current.onerror?.();
    await submitted;
    expect(session.getSnapshot()).toMatchObject({
      file,
      job: null,
      unknown: false,
      error: '连接中断，替换请求结果待核对。',
      message: '当前未发现新的替换任务，请核对后再明确提交。',
    });
    expect(completed).not.toHaveBeenCalled();
  },
);
