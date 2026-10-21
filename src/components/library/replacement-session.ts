import { shareRequest, ShareRequestError } from '../../app/shares/api';
import type { readImageReplacement } from '../../server/media/replacement';

export type ReplacementSetup = ReturnType<typeof readImageReplacement>;
export type ReplacementJob = NonNullable<ReplacementSetup['job']>;
export type ReplacementSnapshot = {
  setup: ReplacementSetup | null;
  file: File | null;
  previewUrl: string | null;
  checking: boolean;
  uploading: boolean;
  transferComplete: boolean;
  progress: number | null;
  job: ReplacementJob | null;
  error: string;
  message: string;
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
    file: null,
    previewUrl: null,
    checking: false,
    uploading: false,
    transferComplete: false,
    progress: null,
    job: null,
    error: '',
    message: '',
    unknown: false,
  };
  private listeners = new Set<() => void>();
  private reader: AbortController | null = null;
  private upload: XMLHttpRequest | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private visible = true;
  private trackedJobId: string | null = null;
  private baselineJobId: string | null = null;
  private completedJobId: string | null = null;
  private previewReleased = false;
  private readonly url: string;
  constructor(
    imageId: string,
    private onCompleted: () => void,
    private onExpired: () => void,
  ) {
    this.url = `/api/images/${encodeURIComponent(imageId)}/replace`;
  }
  getSnapshot = () => this.snapshot;
  setCallbacks(onCompleted: () => void, onExpired: () => void) {
    this.onCompleted = onCompleted;
    this.onExpired = onExpired;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<ReplacementSnapshot>) {
    if (this.stopped) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  start() {
    this.stopped = false;
    if (this.reader?.signal.aborted) this.reader = null;
    if (this.snapshot.file && this.previewReleased) {
      this.previewReleased = false;
      this.update({ previewUrl: URL.createObjectURL(this.snapshot.file) });
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
  choose(file: File | null) {
    if (this.snapshot.uploading || replacementJobActive(this.snapshot.job))
      return;
    if (this.snapshot.previewUrl && !this.previewReleased)
      URL.revokeObjectURL(this.snapshot.previewUrl);
    this.previewReleased = false;
    this.trackedJobId = null;
    this.update({
      file,
      previewUrl: file ? URL.createObjectURL(file) : null,
      error: '',
      message: '',
      job: null,
    });
  }
  private expire() {
    if (this.snapshot.previewUrl && !this.previewReleased)
      URL.revokeObjectURL(this.snapshot.previewUrl);
    this.previewReleased = true;
    this.update({
      setup: null,
      file: null,
      previewUrl: null,
      job: null,
      unknown: false,
      error: '登录已失效',
    });
    this.onExpired();
  }
  async read(preserveError = false) {
    if (this.stopped || !this.visible || this.reader || this.upload) return;
    clearTimeout(this.timer);
    const controller = new AbortController();
    this.reader = controller;
    this.update({ checking: true, ...(preserveError ? {} : { error: '' }) });
    try {
      const setup = await shareRequest<ReplacementSetup>(this.url, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!this.trackedJobId && replacementJobActive(setup.job))
        this.trackedJobId = setup.job!.id;
      if (
        this.snapshot.unknown &&
        setup.job?.id !== this.baselineJobId &&
        setup.job
      )
        this.trackedJobId = setup.job.id;
      const job = setup.job?.id === this.trackedJobId ? setup.job : null;
      const wasUnknown = this.snapshot.unknown;
      this.update({
        setup,
        job,
        unknown: false,
        ...(wasUnknown
          ? {
              message: job
                ? '已读取服务端替换任务。'
                : '当前未发现新的替换任务，请核对后再明确提交。',
            }
          : {}),
        ...(job ? { error: '' } : {}),
        ...(job && !replacementJobActive(job) ? { message: '' } : {}),
      });
      if (job?.status === 'succeeded' && this.completedJobId !== job.id) {
        this.completedJobId = job.id;
        this.onCompleted();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ShareRequestError && error.status === 401)
          this.expire();
        else
          this.update({
            error:
              error instanceof Error
                ? error.message
                : '任务状态读取失败，请重新核对。',
          });
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
  async submit() {
    const { file, setup, unknown, checking } = this.snapshot;
    if (
      this.stopped ||
      this.upload ||
      checking ||
      !file ||
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
      message: '',
      job: null,
    });
    let reconcile = false;
    try {
      const receipt = await this.send(file);
      if (this.stopped) return;
      this.trackedJobId = receipt.jobId;
      this.update({
        job: {
          id: receipt.jobId,
          status: 'queued',
          step: 'identify',
          error: null,
          finishedAt: null,
        },
        message: '新文件已受理。正在准备候选版本，当前外链仍可读取旧图片。',
        unknown: false,
      });
    } catch (error) {
      if (!this.stopped) {
        if (error instanceof UploadError && error.status === 401) this.expire();
        else {
          reconcile = true;
          this.update({
            unknown: true,
            error:
              error instanceof Error ? error.message : '替换提交结果待核对。',
          });
        }
      }
    } finally {
      this.upload = null;
      this.update({ uploading: false });
    }
    if (reconcile && !this.stopped) await this.read(true);
    else this.schedule();
  }
  cancelUpload() {
    if (this.snapshot.uploading && !this.snapshot.transferComplete)
      this.upload?.abort();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.reader?.abort();
    this.upload?.abort();
    if (this.snapshot.previewUrl && !this.previewReleased)
      URL.revokeObjectURL(this.snapshot.previewUrl);
    this.previewReleased = true;
  }
}
