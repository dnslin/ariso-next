import { createUploadTransport } from './transport.ts';
import type {
  CreateUploadTransport,
  UploadItem,
  UploadSessionResult,
  UploadSubmissionResult,
  UploadTransport,
} from './types.ts';

const terminal = new Set<UploadItem['state']>([
  'ready',
  'upload-failed',
  'processing-failed',
  'cancelled',
]);
class ResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly imageId?: string,
  ) {
    super(message);
  }
}

export class UploadController {
  private item: UploadItem | null = null;
  private listeners = new Set<() => void>();
  private transport?: UploadTransport;
  private metadata?: string;
  private generation = 0;
  private destroyed = false;
  private reading = false;
  private readVersion = 0;
  private abort = new AbortController();
  private readonly request: typeof fetch;
  private readonly createTransport: CreateUploadTransport;
  constructor(
    private options: {
      maxFileBytes: number;
      request?: typeof fetch;
      createTransport?: CreateUploadTransport;
      onUnauthorized?: () => void;
    },
  ) {
    this.request = options.request ?? fetch.bind(globalThis);
    this.createTransport = options.createTransport ?? createUploadTransport;
  }
  get snapshot() {
    return this.item;
  }
  getSnapshot = () => this.item;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<UploadItem>) {
    if (!this.item || this.destroyed) return;
    this.item = { ...this.item, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private release() {
    this.transport?.destroy();
    this.transport = undefined;
    if (this.item?.previewUrl) URL.revokeObjectURL(this.item.previewUrl);
    this.update({ previewUrl: null });
  }
  add(file: File): string | null {
    if (this.destroyed) return '上传页面已关闭';
    if (this.item) return '请先移除待提交文件或清空已完成结果';
    if (!file.size) return '文件为空，请重新选择';
    if (file.size > this.options.maxFileBytes) return '文件大小超过上传上限';
    if (
      !/\.(jpe?g|png)$/iu.test(file.name) &&
      !['image/jpeg', 'image/png'].includes(file.type)
    )
      return '当前仅支持 JPEG 和 PNG 图片';
    const id = crypto.randomUUID();
    this.transport = this.createTransport(file, id);
    this.item = {
      id,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      state: 'queued',
    };
    this.listeners.forEach((listener) => listener());
    return null;
  }
  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, {
      ...init,
      cache: 'no-store',
      signal: this.abort.signal,
    });
    if (response.status === 401) this.options.onUnauthorized?.();
    const body = await response.json();
    if (!response.ok)
      throw new ResponseError(
        body.message ?? `请求失败（${response.status}）`,
        response.status,
        body.imageId ?? undefined,
      );
    return body as T;
  }
  private current(generation: number) {
    return (
      !this.destroyed && generation === this.generation && this.item !== null
    );
  }
  private async submit() {
    return this.json<UploadSubmissionResult>('/api/uploads/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: this.metadata,
    });
  }
  private applySubmission(result: UploadSubmissionResult) {
    this.update({
      submissionId: result.id,
      storageId: result.storageId,
      visibility: result.visibility,
    });
    this.applySession(result.sessions[0]);
  }
  private applySession(session: UploadSessionResult) {
    this.update({
      sessionId: session.id,
      imageId: session.imageId ?? undefined,
      jobId: session.jobId ?? undefined,
      cleanupStatus: session.cleanupStatus,
      error: undefined,
      step: session.job?.step,
    });
    if (session.state === 'accepted') {
      this.release();
      const job = session.job;
      if ('job' in session && !job)
        this.update({
          state: 'unknown',
          error: '本次处理任务已不可读取，请打开图片详情核对',
        });
      else if (!job) this.update({ state: 'processing-queued' });
      else if (job.status === 'succeeded') this.update({ state: 'ready' });
      else if (job.status === 'failed' || job.status === 'cancelled')
        this.update({
          state: 'processing-failed',
          error: job.error ?? '服务端处理未完成，请打开详情核对',
        });
      else
        this.update({
          state: job.status === 'queued' ? 'processing-queued' : 'processing',
        });
    } else if (session.state === 'cancelled') {
      this.release();
      this.update({ state: 'cancelled' });
    } else if (session.state === 'failed' || session.state === 'expired') {
      this.release();
      this.update({
        state: 'upload-failed',
        error: session.error ?? '文件接收失败，请重新选择文件',
      });
    } else if (session.state === 'queued') {
      this.update({
        state: 'unknown',
        error: '提交已建立，但文件尚未传输；请取消后重新选择',
      });
    } else {
      this.update({ state: 'saving' });
    }
  }
  async start(visibility: 'public' | 'private', storageId?: string) {
    if (this.item?.state !== 'queued') return;
    const generation = this.generation;
    this.metadata = JSON.stringify({
      requestId: crypto.randomUUID(),
      files: [
        {
          queueItemId: this.item.id,
          originalName: this.item.name,
          declaredSize: this.item.size,
        },
      ],
      visibility,
      ...(storageId ? { storageId } : {}),
    });
    this.update({
      state: 'submitting',
      visibility,
      storageId,
      error: undefined,
    });
    try {
      const submission = await this.submit();
      if (!this.current(generation)) return;
      const session = submission.sessions[0];
      this.update({
        submissionId: submission.id,
        sessionId: session.id,
        storageId: submission.storageId,
        visibility: submission.visibility,
      });
      if (session.state !== 'queued') {
        this.applySession(session);
        return;
      }
      this.update({ state: 'uploading' });
      try {
        const received = await this.transport!.upload(
          session.id,
          (progress) => {
            if (
              this.current(generation) &&
              !this.item?.cancelling &&
              ['uploading', 'saving'].includes(this.item!.state)
            )
              this.update({
                progress,
                state: progress === 100 ? 'saving' : 'uploading',
              });
          },
        );
        if (
          this.current(generation) &&
          !this.item?.cancelling &&
          !this.item?.imageId &&
          !terminal.has(this.item!.state)
        ) {
          // The content response is newer than any read started during transmission.
          this.readVersion++;
          this.applySession(received);
        }
      } catch (error) {
        if (
          this.current(generation) &&
          !this.item?.cancelling &&
          !this.item?.imageId &&
          !terminal.has(this.item!.state)
        )
          this.update({
            error: error instanceof Error ? error.message : String(error),
          });
      }
      if (
        this.current(generation) &&
        !this.item?.cancelling &&
        !terminal.has(this.item!.state)
      )
        await this.refresh();
    } catch (error) {
      if (!this.current(generation)) return;
      if (
        error instanceof ResponseError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        this.release();
        this.update({ state: 'upload-failed', error: error.message });
      } else {
        this.update({
          state: 'unknown',
          error: `提交结果尚未确认：${error instanceof Error ? error.message : String(error)}。请再次查询；不会自动重新上传文件`,
        });
      }
    }
  }
  async refresh() {
    if (
      !this.item ||
      !this.metadata ||
      this.reading ||
      this.item.cancelling ||
      terminal.has(this.item.state)
    )
      return;
    const generation = this.generation;
    this.reading = true;
    const readVersion = this.readVersion;
    try {
      // Repeating only immutable metadata recovers a lost response through the server's requestId contract.
      const result = this.item.submissionId
        ? await this.json<UploadSubmissionResult>(
            `/api/uploads/submissions/${encodeURIComponent(this.item.submissionId)}`,
          )
        : await this.submit();
      if (
        this.current(generation) &&
        readVersion === this.readVersion &&
        !this.item?.cancelling
      )
        this.applySubmission(result);
    } catch (error) {
      if (
        this.current(generation) &&
        readVersion === this.readVersion &&
        !this.item?.cancelling
      )
        if (
          !this.item?.submissionId &&
          error instanceof ResponseError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          this.release();
          this.update({ state: 'upload-failed', error: error.message });
        } else
          this.update({
            state: 'unknown',
            error: `结果读取失败：${error instanceof Error ? error.message : String(error)}。请再次查询。`,
          });
    } finally {
      this.reading = false;
    }
  }
  async cancel() {
    if (
      !this.item?.sessionId ||
      this.item.imageId ||
      this.item.cancelling ||
      terminal.has(this.item.state)
    )
      return;
    const generation = this.generation;
    this.readVersion++;
    this.update({ cancelling: true });
    try {
      const session = await this.json<UploadSessionResult>(
        `/api/uploads/sessions/${encodeURIComponent(this.item.sessionId)}`,
        { method: 'DELETE' },
      );
      if (this.current(generation)) this.applySession(session);
    } catch (error) {
      if (!this.current(generation)) return;
      if (
        error instanceof ResponseError &&
        error.status === 409 &&
        error.imageId
      ) {
        this.release();
        this.update({
          imageId: error.imageId,
          state: 'unknown',
          error: '图片已进入服务端处理，正在核对结果',
        });
      } else
        this.update({
          state: 'unknown',
          error: `取消结果尚未确认：${error instanceof Error ? error.message : String(error)}`,
        });
    } finally {
      if (this.current(generation)) {
        this.update({ cancelling: false });
        if (!terminal.has(this.item!.state)) await this.refresh();
      }
    }
  }
  remove() {
    if (this.item?.state !== 'queued') return;
    this.clear();
  }
  clearCompleted() {
    if (this.item && terminal.has(this.item.state)) this.clear();
  }
  private clear() {
    this.generation++;
    this.release();
    this.metadata = undefined;
    this.item = null;
    this.listeners.forEach((listener) => listener());
  }
  destroy() {
    this.clear();
    this.destroyed = true;
    this.abort.abort();
    this.listeners.clear();
  }
}
