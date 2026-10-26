import { copyImageEditRecipe } from '../../shared/image-editing';
import {
  ImageEditorRequestError,
  readEditJob,
  retryEditJob,
  submitEdit,
} from './client';
import type { EditIntent, EditJob, EditReference } from './types';

export interface EditSessionSnapshot {
  phase: 'ready' | 'submitting' | 'unknown' | 'not_accepted' | 'tracked';
  job: EditJob | null;
  message: string;
  checking: boolean;
}
export const editJobActive = (job: EditJob | null) =>
  job?.status === 'queued' || job?.status === 'running';
const empty: EditSessionSnapshot = {
  phase: 'ready',
  job: null,
  message: '',
  checking: false,
};
export class ImageEditSession {
  private snapshot: EditSessionSnapshot;
  private listeners = new Set<() => void>();
  private intent: EditIntent | null;
  private timer?: ReturnType<typeof setTimeout>;
  private reading: Promise<void> | null = null;
  private visible = true;
  private completed = false;
  readonly reference: EditReference;
  constructor(
    reference: EditReference,
    intent?: EditIntent,
    private onChanged: (job: EditJob) => void = () => undefined,
    private onExpired: () => void = () => undefined,
  ) {
    this.reference = reference;
    this.intent = intent
      ? { ...intent, recipe: copyImageEditRecipe(intent.recipe) }
      : null;
    this.snapshot = intent ? empty : { ...empty, phase: 'unknown' };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(values: Partial<EditSessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...values };
    this.listeners.forEach((listener) => listener());
  }
  private authorization(error: unknown) {
    if (error instanceof ImageEditorRequestError && error.status === 401) {
      this.visible = false;
      clearTimeout(this.timer);
      this.onExpired();
    }
  }
  private accept(job: EditJob) {
    this.update({ phase: 'tracked', job, message: '', checking: false });
    if (job.status === 'succeeded' && !this.completed) {
      this.completed = true;
      this.onChanged(job);
    }
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.visible && editJobActive(this.snapshot.job))
      this.timer = setTimeout(() => {
        void this.read();
      }, 1500);
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    clearTimeout(this.timer);
    if (
      visible &&
      (editJobActive(this.snapshot.job) || this.snapshot.phase === 'unknown')
    )
      void this.read();
  }
  async submit() {
    if (
      !this.intent ||
      !['ready', 'not_accepted'].includes(this.snapshot.phase) ||
      this.snapshot.checking
    )
      return;
    this.update({ phase: 'submitting', message: '' });
    try {
      this.accept(await submitEdit(this.intent));
    } catch (error) {
      this.authorization(error);
      if (error instanceof ImageEditorRequestError && error.status < 500)
        this.update({ phase: 'not_accepted', message: error.message });
      else {
        this.update({
          phase: 'unknown',
          message: error instanceof Error ? error.message : '提交结果待核对',
        });
        await this.read();
      }
    }
  }
  read(): Promise<void> {
    if (this.reading) return this.reading;
    this.reading = this.readCurrent().finally(() => {
      this.reading = null;
    });
    return this.reading;
  }
  private async readCurrent() {
    this.update({ checking: true });
    try {
      this.accept(await readEditJob(this.reference.requestId));
    } catch (error) {
      this.authorization(error);
      if (error instanceof ImageEditorRequestError && error.status === 404)
        this.update({
          phase: 'not_accepted',
          job: null,
          message: this.intent
            ? '服务器尚未找到这个请求，可使用同一请求编号重新提交。'
            : '未找到已受理任务，请返回编辑后明确重新提交。',
          checking: false,
        });
      else
        this.update({
          phase: this.snapshot.job ? 'tracked' : 'unknown',
          message:
            error instanceof Error
              ? error.message
              : '状态读取失败，请重试核对。',
          checking: false,
        });
      this.schedule();
    }
  }
  async retry() {
    if (this.snapshot.checking || editJobActive(this.snapshot.job)) return;
    if (this.snapshot.phase === 'not_accepted' && this.intent)
      return this.submit();
    if (
      !this.snapshot.job ||
      !['failed', 'cancelled'].includes(this.snapshot.job.status)
    )
      return;
    this.update({ checking: true, message: '' });
    try {
      this.accept(await retryEditJob(this.reference.requestId));
    } catch (error) {
      this.authorization(error);
      this.update({
        message: error instanceof Error ? error.message : '重试结果待核对',
        checking: false,
      });
      await this.read();
    }
  }
  canResubmit() {
    return Boolean(this.intent) && this.snapshot.phase === 'not_accepted';
  }
  intentForStorage() {
    return this.intent;
  }
}
