import { shareRequest, ShareRequestError } from '../../app/shares/api';
import type { readImageReplacement } from '../../server/media/replacement';
import { notifyLibraryChanged } from './library-changes';

export type ReplacementSetup = ReturnType<typeof readImageReplacement>;
export type ReplacementJob = NonNullable<ReplacementSetup['job']>;
export type ReplacementSnapshot = {
  setup: ReplacementSetup | null;
  checking: boolean;
  selecting: boolean;
  uploading: boolean;
  transferComplete: boolean;
  progress: number | null;
  job: ReplacementJob | null;
  error: string;
  unknown: boolean;
};
type Receipt = {
  imageId: string;
  jobId: string;
  status: 'queued';
  byteSize: number;
};
class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
export const replacementJobActive = (job: ReplacementJob | null) =>
  job?.status === 'queued' || job?.status === 'running';

/** Owns one explicit file submission; a queued receipt is followed until a real terminal state. */
export class ReplacementSession {
  private snapshot: ReplacementSnapshot = {
    setup: null,
    checking: false,
    selecting: false,
    uploading: false,
    transferComplete: false,
    progress: null,
    job: null,
    error: '',
    unknown: false,
  };
  private listeners = new Set<() => void>();
  private reader: AbortController | null = null;
  private reading: Promise<void> | null = null;
  private upload: XMLHttpRequest | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private visible = true;
  private trackedJobId: string | null = null;
  private baselineJobId: string | null = null;
  private completedJobId: string | null = null;
  private rejection: string | null = null;
  private onChanged = notifyLibraryChanged;
  private readonly url: string;
  constructor(
    imageId: string,
    private onCompleted: () => void,
    private onExpired: () => void,
    private onBackgroundError: (message: string) => void,
  ) {
    this.url = `/api/images/${encodeURIComponent(imageId)}/replace`;
  }
  getSnapshot = () => this.snapshot;
  setCallbacks(callbacks: {
    onCompleted: () => void;
    onExpired: () => void;
    onChanged: () => void;
    onBackgroundError: (message: string) => void;
  }) {
    this.onCompleted = callbacks.onCompleted;
    this.onExpired = callbacks.onExpired;
    this.onChanged = callbacks.onChanged;
    this.onBackgroundError = callbacks.onBackgroundError;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<ReplacementSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  start() {
    this.stopped = false;
    if (this.reader?.signal.aborted) {
      this.reader = null;
      this.reading = null;
    }
    return this.read();
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    clearTimeout(this.timer);
    if (visible) void this.read();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (
      !this.stopped &&
      this.visible &&
      replacementJobActive(this.snapshot.job)
    )
      this.timer = setTimeout(() => {
        void this.read();
      }, 1500);
  }
  async choose(file: File | null) {
    if (
      !file ||
      this.stopped ||
      this.snapshot.selecting ||
      this.upload ||
      this.snapshot.unknown ||
      replacementJobActive(this.snapshot.job)
    )
      return;
    this.rejection = null;
    this.update({ selecting: true, error: '' });
    try {
      if (!this.snapshot.setup || this.snapshot.checking) {
        await this.read();
        if (this.snapshot.error || !this.snapshot.setup) return;
      }
      const unavailable = this.snapshot.setup.unavailableReason;
      if (unavailable) {
        this.update({ error: unavailable });
        if (this.stopped) this.onBackgroundError(unavailable);
        this.onChanged();
        return;
      }
      await this.submit(file);
    } finally {
      this.update({ selecting: false });
    }
  }
  private expire() {
    this.update({
      setup: null,
      job: null,
      unknown: false,
      error: '登录已失效',
    });
    this.onExpired();
  }
  read(preserveError = false): Promise<void> {
    if (this.reading) return this.reading;
    const reading = this.readCurrent(preserveError).finally(() => {
      if (this.reading === reading) this.reading = null;
    });
    this.reading = reading;
    return reading;
  }
  private async readCurrent(preserveError: boolean) {
    if (
      ((this.stopped || !this.visible) && !this.snapshot.selecting) ||
      this.reader ||
      this.upload
    )
      return;
    clearTimeout(this.timer);
    const controller = new AbortController();
    this.reader = controller;
    this.update({
      checking: true,
      ...(preserveError || this.rejection !== null ? {} : { error: '' }),
    });
    try {
      const setup = await shareRequest<ReplacementSetup>(this.url, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (this.rejection !== null) {
        this.update({
          setup,
          job: null,
          unknown: false,
          error: this.rejection,
        });
        return;
      }
      if (
        !this.trackedJobId &&
        (replacementJobActive(setup.job) ||
          (setup.job?.id !== this.baselineJobId &&
            (setup.job?.status === 'failed' ||
              setup.job?.status === 'cancelled')))
      )
        this.trackedJobId = setup.job!.id;
      if (
        this.snapshot.unknown &&
        setup.job?.id !== this.baselineJobId &&
        setup.job
      )
        this.trackedJobId = setup.job.id;
      const job = setup.job?.id === this.trackedJobId ? setup.job : null;
      const previousJob = this.snapshot.job;
      this.update({
        setup,
        job,
        unknown: false,
        ...(job ? { error: '' } : {}),
      });
      if (
        job &&
        !replacementJobActive(job) &&
        (previousJob?.id !== job.id || previousJob.status !== job.status)
      )
        this.onChanged();
      if (job?.status === 'succeeded' && this.completedJobId !== job.id) {
        this.completedJobId = job.id;
        this.onCompleted();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ShareRequestError && error.status === 401)
          this.expire();
        else {
          const message =
            error instanceof Error
              ? error.message
              : '任务状态读取失败，请重新核对。';
          this.update({
            error:
              this.rejection === null
                ? message
                : `${this.rejection}\n${message}`,
          });
          if (this.stopped && this.snapshot.selecting)
            this.onBackgroundError(message);
        }
      }
    } finally {
      if (this.reader === controller) {
        this.reader = null;
        this.update({ checking: false });
        this.schedule();
      }
    }
  }
  private send(file: File) {
    return new Promise<Receipt>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.upload = xhr;
      xhr.open('POST', this.url);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          this.update({
            progress: Math.round((event.loaded / event.total) * 100),
          });
      };
      xhr.upload.onload = () =>
        this.update({ transferComplete: true, progress: 100 });
      xhr.onload = () => {
        let body;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          reject(new UploadError('服务器响应无法识别，正在核对任务。'));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300)
          reject(
            new UploadError(
              body?.message ?? `替换请求失败（HTTP ${xhr.status}）`,
              xhr.status,
            ),
          );
        else resolve(body as Receipt);
      };
      xhr.onerror = () =>
        reject(new UploadError('连接中断，替换请求结果待核对。'));
      xhr.onabort = () =>
        reject(new UploadError('传输已取消，正在核对服务端任务。'));
      const data = new FormData();
      data.append('file', file);
      xhr.send(data);
    });
  }
  private async submit(file: File) {
    const { setup, unknown, checking } = this.snapshot;
    if (
      (this.stopped && !this.snapshot.selecting) ||
      this.upload ||
      checking ||
      unknown ||
      !setup ||
      setup.unavailableReason ||
      replacementJobActive(this.snapshot.job)
    )
      return;
    this.baselineJobId = setup.job?.id ?? null;
    this.trackedJobId = null;
    this.update({
      uploading: true,
      transferComplete: false,
      progress: null,
      error: '',
      job: null,
    });
    let reconcile = false;
    try {
      const receipt = await this.send(file);
      this.onChanged();
      this.trackedJobId = receipt.jobId;
      this.update({
        job: {
          id: receipt.jobId,
          status: 'queued',
          step: 'identify',
          error: null,
          finishedAt: null,
        },
        unknown: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '替换提交结果待核对。';
      this.onChanged();
      if (error instanceof UploadError && error.status === 401) this.expire();
      else if (
        error instanceof UploadError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        this.rejection = message;
        this.trackedJobId = null;
        this.update({ unknown: false, job: null, error: message });
        if (this.stopped) this.onBackgroundError(message);
      } else {
        reconcile = !this.stopped;
        this.update({ unknown: true, error: message });
        if (this.stopped) this.onBackgroundError(message);
      }
    } finally {
      this.upload = null;
      this.update({ uploading: false });
    }
    if (reconcile && !this.stopped) await this.read(true);
    else this.schedule();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (!this.snapshot.selecting) this.reader?.abort();
    // Closing details detaches observation, not the already chosen upload.
    // Its one XHR settles normally and releases its reference in submit.finally.
    if (
      this.snapshot.selecting ||
      this.upload ||
      replacementJobActive(this.snapshot.job)
    )
      this.onChanged();
  }
}
