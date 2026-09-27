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
type Entry = {
  item: UploadItem;
  transport?: UploadTransport;
  batch?: Batch;
  groupIndex?: number;
  readVersion: number;
  transferState: 'idle' | 'active' | 'finished';
};
type Batch = {
  metadata: string;
  entries: Entry[];
  submissionId?: string;
  reading: boolean;
};

/** One page queue. Submissions own immutable settings; entries own file/response lifetimes. */
export class UploadController {
  private entries = new Map<string, Entry>();
  private items: readonly UploadItem[] = [];
  private listeners = new Set<() => void>();
  private destroyed = false;
  private activeTransfers = 0;
  private abort = new AbortController();
  private readonly request: typeof fetch;
  private readonly createTransport: CreateUploadTransport;
  constructor(
    private options: {
      maxFileBytes: number;
      queueLimit: number;
      request?: typeof fetch;
      createTransport?: CreateUploadTransport;
      onUnauthorized?: () => void;
    },
  ) {
    this.request = options.request ?? fetch.bind(globalThis);
    this.createTransport = options.createTransport ?? createUploadTransport;
  }
  get snapshot() {
    return this.items;
  }
  getSnapshot = () => this.items;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    this.items = [...this.entries.values()].map((entry) => entry.item);
    this.listeners.forEach((listener) => listener());
  }
  private current(entry: Entry) {
    return !this.destroyed && this.entries.get(entry.item.id) === entry;
  }
  private update(entry: Entry, patch: Partial<UploadItem>) {
    if (!this.current(entry)) return;
    entry.item = { ...entry.item, ...patch };
    this.emit();
  }
  private release(entry: Entry) {
    entry.transport?.destroy();
    entry.transport = undefined;
    if (entry.item.previewUrl) URL.revokeObjectURL(entry.item.previewUrl);
    this.update(entry, { previewUrl: null });
  }
  add(file: File): string | null {
    if (this.destroyed) return '上传页面已关闭';
    if (this.entries.size >= this.options.queueLimit)
      return '队列已达到上限，请清空已完成结果后继续添加';
    if (!file.size) return '文件为空，请重新选择';
    if (file.size > this.options.maxFileBytes) return '文件大小超过上传上限';
    if (
      !/\.(jpe?g|png)$/iu.test(file.name) &&
      !['image/jpeg', 'image/png'].includes(file.type)
    )
      return '当前仅支持 JPEG 和 PNG 图片';
    const id = crypto.randomUUID();
    this.entries.set(id, {
      item: {
        id,
        name: file.name,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        state: 'queued',
      },
      transport: this.createTransport(file, id),
      readVersion: 0,
      transferState: 'idle',
    });
    this.emit();
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
  private submit(batch: Batch) {
    return this.json<UploadSubmissionResult>('/api/uploads/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: batch.metadata,
    });
  }
  private applySession(entry: Entry, session: UploadSessionResult) {
    this.update(entry, {
      sessionId: session.id,
      imageId: session.imageId ?? undefined,
      jobId: session.jobId ?? undefined,
      cleanupStatus: session.cleanupStatus,
      error: undefined,
      step: session.job?.step,
    });
    if (session.state === 'accepted') {
      this.release(entry);
      const job = session.job;
      if ('job' in session && !job)
        this.update(entry, {
          state: 'unknown',
          error: '本次处理任务已不可读取，请打开图片详情核对',
        });
      else if (!job) this.update(entry, { state: 'processing-queued' });
      else if (job.status === 'succeeded')
        this.update(entry, { state: 'ready' });
      else if (job.status === 'failed' || job.status === 'cancelled')
        this.update(entry, {
          state: 'processing-failed',
          error: job.error ?? '服务端处理未完成，请打开详情核对',
        });
      else
        this.update(entry, {
          state: job.status === 'queued' ? 'processing-queued' : 'processing',
        });
    } else if (session.state === 'cancelled') {
      this.release(entry);
      this.update(entry, { state: 'cancelled' });
    } else if (session.state === 'failed' || session.state === 'expired') {
      this.release(entry);
      this.update(entry, {
        state: 'upload-failed',
        error: session.error ?? '文件接收失败，请重新选择文件',
      });
    } else if (session.state === 'queued') {
      // Only files admitted by a confirmed submission may wait for their first send.
      // A transport already dispatched is never automatically sent a second time.
      if (entry.transferState === 'active') return;
      this.update(
        entry,
        entry.item.state === 'waiting-upload' && entry.transferState === 'idle'
          ? { state: 'waiting-upload' }
          : {
              state: 'unknown',
              error: '提交已建立，但文件尚未传输；请取消后重新选择',
            },
      );
    } else this.update(entry, { state: 'saving' });
  }
  private applySubmission(
    batch: Batch,
    result: UploadSubmissionResult,
    revisions?: Map<Entry, number>,
    initial = false,
  ) {
    batch.submissionId = result.id;
    for (const session of result.sessions) {
      const entry = batch.entries.find(
        (entry) => entry.item.id === session.queueItemId,
      );
      if (
        !entry ||
        !this.current(entry) ||
        entry.item.cancelling ||
        terminal.has(entry.item.state) ||
        (revisions && revisions.get(entry) !== entry.readVersion)
      )
        continue;
      entry.groupIndex = session.groupIndex;
      this.update(entry, {
        submissionId: result.id,
        storageId: result.storageId,
        visibility: result.visibility,
        ...(initial && session.state === 'queued'
          ? { state: 'waiting-upload' as const }
          : {}),
      });
      this.applySession(entry, session);
    }
  }
  async start(visibility: 'public' | 'private', storageId?: string) {
    const entries = [...this.entries.values()].filter(
      (entry) => entry.item.state === 'queued' && !entry.batch,
    );
    if (!entries.length || this.destroyed) return;
    const batch: Batch = {
      entries,
      reading: true,
      metadata: JSON.stringify({
        requestId: crypto.randomUUID(),
        files: entries.map(({ item }) => ({
          queueItemId: item.id,
          originalName: item.name,
          declaredSize: item.size,
        })),
        visibility,
        ...(storageId ? { storageId } : {}),
      }),
    };
    for (const entry of entries) {
      entry.batch = batch;
      this.update(entry, {
        state: 'submitting',
        visibility,
        storageId,
        error: undefined,
      });
    }
    try {
      const submission = await this.submit(batch);
      this.applySubmission(batch, submission, undefined, true);
    } catch (error) {
      for (const entry of entries) {
        if (!this.current(entry)) continue;
        if (
          error instanceof ResponseError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          this.release(entry);
          this.update(entry, { state: 'upload-failed', error: error.message });
        } else
          this.update(entry, {
            state: 'unknown',
            error: `提交结果尚未确认：${error instanceof Error ? error.message : String(error)}。请再次查询；不会自动重新上传文件`,
          });
      }
    } finally {
      batch.reading = false;
    }
    await this.schedule();
  }
  private eligible(entry: Entry) {
    return (
      entry.item.state === 'waiting-upload' &&
      !entry.item.cancelling &&
      entry.transferState === 'idle' &&
      entry.batch?.entries.every(
        (other) =>
          other.groupIndex === undefined ||
          other.groupIndex >= entry.groupIndex! ||
          !!other.item.imageId ||
          terminal.has(other.item.state),
      )
    );
  }
  private async schedule() {
    const started: Promise<void>[] = [];
    for (const entry of this.entries.values()) {
      if (this.destroyed || this.activeTransfers >= 3) break;
      if (!this.eligible(entry)) continue;
      entry.transferState = 'active';
      this.activeTransfers++;
      started.push(
        this.transfer(entry).finally(() => {
          this.activeTransfers--;
          void this.schedule();
        }),
      );
    }
    await Promise.all(started);
  }
  private async transfer(entry: Entry) {
    this.update(entry, { state: 'uploading' });
    try {
      const received = await entry.transport!.upload(
        entry.item.sessionId!,
        (progress) => {
          if (
            this.current(entry) &&
            !entry.item.cancelling &&
            ['uploading', 'saving'].includes(entry.item.state)
          )
            this.update(entry, {
              progress,
              state: progress === 100 ? 'saving' : 'uploading',
            });
        },
      );
      entry.transferState = 'finished';
      if (
        this.current(entry) &&
        !entry.item.cancelling &&
        !entry.item.imageId &&
        !terminal.has(entry.item.state)
      ) {
        entry.readVersion++;
        this.applySession(entry, received);
      }
    } catch (error) {
      entry.transferState = 'finished';
      if (
        this.current(entry) &&
        !entry.item.cancelling &&
        !entry.item.imageId &&
        !terminal.has(entry.item.state)
      )
        this.update(entry, {
          error: error instanceof Error ? error.message : String(error),
        });
    }
    if (
      this.current(entry) &&
      !entry.item.cancelling &&
      !terminal.has(entry.item.state)
    )
      await this.refresh(entry.item.id);
  }
  async refresh(id?: string) {
    const selected = id
      ? [this.entries.get(id)].filter((entry): entry is Entry => !!entry)
      : [...this.entries.values()];
    const batches = new Set(
      selected
        .filter(
          (entry) =>
            entry.batch &&
            !entry.item.cancelling &&
            !terminal.has(entry.item.state),
        )
        .map((entry) => entry.batch!),
    );
    await Promise.all(
      [...batches].map(async (batch) => {
        if (batch.reading) return;
        batch.reading = true;
        const revisions = new Map(
          batch.entries.map((entry) => [entry, entry.readVersion]),
        );
        try {
          const result = batch.submissionId
            ? await this.json<UploadSubmissionResult>(
                `/api/uploads/submissions/${encodeURIComponent(batch.submissionId)}`,
              )
            : await this.submit(batch);
          this.applySubmission(batch, result, revisions);
        } catch (error) {
          for (const entry of batch.entries) {
            if (
              !this.current(entry) ||
              revisions.get(entry) !== entry.readVersion ||
              entry.item.cancelling ||
              terminal.has(entry.item.state)
            )
              continue;
            if (
              !batch.submissionId &&
              error instanceof ResponseError &&
              error.status >= 400 &&
              error.status < 500
            ) {
              this.release(entry);
              this.update(entry, {
                state: 'upload-failed',
                error: error.message,
              });
            } else
              this.update(entry, {
                state:
                  entry.item.state === 'waiting-upload' ||
                  (entry.transferState === 'active' &&
                    ['uploading', 'saving'].includes(entry.item.state))
                    ? entry.item.state
                    : 'unknown',
                error: `结果读取失败：${error instanceof Error ? error.message : String(error)}。请再次查询。`,
              });
          }
        } finally {
          batch.reading = false;
        }
      }),
    );
    void this.schedule();
  }
  async cancel(id: string) {
    const entry = this.entries.get(id);
    if (
      !entry?.item.sessionId ||
      entry.item.imageId ||
      entry.item.cancelling ||
      terminal.has(entry.item.state)
    )
      return;
    entry.readVersion++;
    this.update(entry, { cancelling: true });
    try {
      const session = await this.json<UploadSessionResult>(
        `/api/uploads/sessions/${encodeURIComponent(entry.item.sessionId)}`,
        { method: 'DELETE' },
      );
      if (this.current(entry)) this.applySession(entry, session);
    } catch (error) {
      if (!this.current(entry)) return;
      if (
        error instanceof ResponseError &&
        error.status === 409 &&
        error.imageId
      ) {
        this.release(entry);
        this.update(entry, {
          imageId: error.imageId,
          state: 'unknown',
          error: '图片已进入服务端处理，正在核对结果',
        });
      } else
        this.update(entry, {
          state: 'unknown',
          error: `取消结果尚未确认：${error instanceof Error ? error.message : String(error)}`,
        });
    } finally {
      if (this.current(entry)) {
        this.update(entry, { cancelling: false });
        if (!terminal.has(entry.item.state)) await this.refresh(id);
        void this.schedule();
      }
    }
  }
  remove(id: string) {
    const entry = this.entries.get(id);
    if (entry?.item.state === 'queued' && !entry.batch) this.clear(entry);
  }
  clearCompleted() {
    for (const entry of this.entries.values())
      if (terminal.has(entry.item.state)) this.clear(entry);
  }
  private clear(entry: Entry) {
    this.release(entry);
    this.entries.delete(entry.item.id);
    this.emit();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const entry of this.entries.values()) {
      entry.transport?.destroy();
      if (entry.item.previewUrl) URL.revokeObjectURL(entry.item.previewUrl);
    }
    this.entries.clear();
    this.abort.abort();
    this.emit();
    this.listeners.clear();
  }
}
