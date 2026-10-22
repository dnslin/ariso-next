import { shareRequest, ShareRequestError } from '../../app/shares/api';
import type {
  OwnerImageShare,
  OwnerImageShareSettings,
} from '../../server/sharing/image-configuration';

type Snapshot = {
  settings: OwnerImageShareSettings | null;
  pending: 'read' | 'create' | 'revoke' | null;
  error: string;
  message: string;
  unknown: boolean;
};

/** One dialog owns its requests. Unknown writes are read back before another write. */
export class ImageShareSession {
  private snapshot: Snapshot = {
    settings: null,
    pending: null,
    error: '',
    message: '',
    unknown: false,
  };
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private stopped = false;
  private uncertain: 'create' | 'revoke' | null = null;
  private readonly url: string;
  constructor(
    imageId: string,
    private readonly onExpired: () => void,
    private readonly onChanged: () => void = () => undefined,
  ) {
    this.url = `/api/images/${encodeURIComponent(imageId)}/share`;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  start() {
    this.stopped = false;
    if (this.active?.signal.aborted) this.active = null;
    return this.read();
  }
  private update(patch: Partial<Snapshot>) {
    if (this.stopped) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private failed(error: unknown) {
    if (error instanceof ShareRequestError && error.status === 401) {
      this.update({ settings: null, error: '登录已失效', unknown: false });
      this.onExpired();
      return true;
    }
    this.update({
      error: error instanceof Error ? error.message : '连接中断，请重试。',
    });
    return false;
  }
  async read() {
    if (this.stopped || this.active) return;
    const controller = new AbortController();
    this.active = controller;
    this.update({ pending: 'read', error: '' });
    try {
      const settings = await shareRequest<OwnerImageShareSettings>(this.url, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const confirmed =
        this.uncertain === 'create'
          ? settings.share?.state === 'active'
          : this.uncertain === 'revoke'
            ? settings.share?.state !== 'active'
            : true;
      if (confirmed) this.uncertain = null;
      this.update({
        settings,
        unknown: !confirmed,
        message: !confirmed
          ? '当前结果尚未确认，请再次核对。'
          : '已读取当前分享状态。',
      });
    } catch (error) {
      if (!controller.signal.aborted) this.failed(error);
    } finally {
      if (this.active === controller) {
        this.active = null;
        this.update({ pending: null });
      }
    }
  }
  async create(hours: number) {
    const settings = this.snapshot.settings;
    if (
      !settings?.sourceVersion ||
      settings.unavailableReason ||
      settings.share?.state === 'active'
    )
      return;
    await this.change('create', {
      hours,
      sourceVersion: settings.sourceVersion,
    });
  }
  async revoke() {
    if (this.snapshot.settings?.share?.state !== 'active') return;
    await this.change('revoke');
  }
  private async change(kind: 'create' | 'revoke', input?: unknown) {
    if (this.stopped || this.active || this.snapshot.unknown) return;
    const controller = new AbortController();
    this.active = controller;
    this.update({ pending: kind, error: '', message: '' });
    try {
      const result = await shareRequest<
        OwnerImageShareSettings | { share: OwnerImageShare }
      >(this.url, {
        method: kind === 'create' ? 'POST' : 'DELETE',
        headers: input ? { 'Content-Type': 'application/json' } : undefined,
        body: input ? JSON.stringify(input) : undefined,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      this.update({
        settings:
          'sourceVersion' in result
            ? result
            : {
                ...this.snapshot.settings!,
                share: result.share,
                sourceVersion: result.share.sourceVersion,
              },
        unknown: false,
        message:
          kind === 'create' ? '分享已创建。' : '分享已撤销，旧地址不会恢复。',
      });
      this.onChanged();
    } catch (error) {
      if (
        !controller.signal.aborted &&
        !this.failed(error) &&
        !(error instanceof ShareRequestError && error.status < 500)
      ) {
        this.uncertain = kind;
        this.update({
          unknown: true,
          message: '请求结果不明，正在读取当前分享。',
        });
      }
    } finally {
      if (this.active === controller) {
        this.active = null;
        this.update({ pending: null });
      }
    }
    if (this.uncertain && !this.stopped) await this.read();
  }
  stop() {
    this.stopped = true;
    this.active?.abort();
  }
}
