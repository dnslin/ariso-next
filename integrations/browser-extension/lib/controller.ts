import Uppy from '@uppy/core';
import XHRUpload from '@uppy/xhr-upload';
import { normalizeSettings } from './settings-input';
import { parseUploadResponse } from './result';
import type {
  AddResult,
  Capabilities,
  ExtensionSettings,
  UploadItem,
  UploadSnapshot,
  VersionKind,
} from './types';

type Meta = {
  queueId: string;
  visibility: string;
  storageId?: string;
  albumId?: string;
  tag?: string;
};
type ResponseBody = Record<string, unknown>;
const IMAGE_NAME = /\.(png|jpe?g|gif|webp|svg|avif|heic|heif|tiff?|bmp|ico)$/i;
const ACTIVE = ['uploading', 'processing'];
export const UPLOAD_IDLE_TIMEOUT_MS = 3_000_000;

/** Owns browser Files and object URLs; only request metadata leaves this page. */
export class UploadController {
  private snapshot: UploadSnapshot = { items: [], busy: false };
  private listeners = new Set<() => void>();
  private files = new Map<string, File>();
  private active: Uppy<Meta, ResponseBody> | null = null;
  constructor(private capabilities: Capabilities | null = null) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setCapabilities(capabilities: Capabilities) {
    this.capabilities = capabilities;
  }
  private publish(
    items: readonly UploadItem[] = this.snapshot.items,
    busy = this.snapshot.busy,
  ) {
    this.snapshot = { items, busy };
    this.listeners.forEach((listener) => listener());
  }
  private update(id: string, values: Partial<UploadItem>) {
    this.publish(
      this.snapshot.items.map((item) =>
        item.id === id ? { ...item, ...values } : item,
      ),
    );
  }
  addFiles(files: File[], source: UploadItem['source'] = 'local'): AddResult {
    if (!this.capabilities)
      return { added: 0, rejected: files.length, message: '请先连接 Ariso' };
    const added: UploadItem[] = [];
    let rejected = 0;
    for (const file of files) {
      if (
        this.snapshot.items.length + added.length >=
          this.capabilities.queueLimit ||
        !file.size ||
        file.size > this.capabilities.maxFileBytes ||
        (!file.type.startsWith('image/') && !IMAGE_NAME.test(file.name))
      ) {
        rejected++;
        continue;
      }
      const id = crypto.randomUUID();
      this.files.set(id, file);
      added.push({
        id,
        name: file.name || `粘贴图片-${Date.now()}.png`,
        bytes: file.size,
        previewUrl: URL.createObjectURL(file),
        source,
        state: 'queued',
        progress: 0,
      });
    }
    if (added.length) this.publish([...this.snapshot.items, ...added]);
    return {
      added: added.length,
      rejected,
      message: rejected
        ? `${rejected} 项未加入：请检查格式、空文件、大小和队列上限`
        : null,
    };
  }
  remove(id: string) {
    const item = this.snapshot.items.find((item) => item.id === id);
    if (!item || item.state !== 'queued') return;
    this.active?.removeFile(id);
    this.files.delete(id);
    URL.revokeObjectURL(item.previewUrl);
    this.publish(this.snapshot.items.filter((item) => item.id !== id));
  }
  clear() {
    if (this.snapshot.busy) return;
    this.snapshot.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    this.files.clear();
    this.publish([]);
  }
  useVersion(id: string, kind: VersionKind) {
    const item = this.snapshot.items.find((item) => item.id === id);
    const version = item?.versions?.[kind];
    if (
      !item ||
      !version ||
      !['ready', 'version-unavailable'].includes(item.state)
    )
      return;
    this.update(id, {
      state: 'ready',
      selectedVersion: kind,
      url: version.url,
      message: undefined,
    });
  }
  async start(value: ExtensionSettings) {
    if (this.snapshot.busy) return;
    const settings = normalizeSettings(value);
    if (!this.capabilities) throw new Error('请先测试连接');
    if (!settings.storageId && !this.capabilities.defaultStorageAvailable)
      throw new Error('站点没有可用默认存储，请在设置中指定有效存储 ID');
    const batch = this.snapshot.items.filter((item) => item.state === 'queued');
    if (!batch.length) return;
    const oversized = batch.find(
      (item) => item.bytes > this.capabilities!.maxFileBytes,
    );
    if (oversized)
      throw new Error(`“${oversized.name}”超过当前站点单图大小限制`);
    const visibility =
      settings.visibility ?? this.capabilities.defaultVisibility;
    const target = `${settings.siteUrl}/api/upload`;
    const metadata: Omit<Meta, 'queueId'> = {
      visibility,
      ...(settings.storageId ? { storageId: settings.storageId } : {}),
      ...(settings.albumId ? { albumId: settings.albumId } : {}),
      ...(settings.tag ? { tag: settings.tag } : {}),
    };
    const diagnostic = (error: unknown) =>
      (error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '上传客户端错误'
      ).replaceAll(settings.token, '[已隐藏 Token]');
    // A fresh batch avoids Uppy.upload() retrying failed files from older intentions.
    const uppy = new Uppy<Meta, ResponseBody>({
      autoProceed: false,
      onBeforeFileAdded: (file) => ({ ...file, id: file.meta.queueId }),
      logger: {
        debug() {},
        warn: (error) => console.warn('Ariso 上传', diagnostic(error)),
        error: (error) => console.error('Ariso 上传', diagnostic(error)),
      },
    });
    this.active = uppy;
    const requests = new WeakMap<XMLHttpRequest, string[]>();
    uppy.use(XHRUpload, {
      endpoint: target,
      method: 'POST',
      fieldName: 'file',
      formData: true,
      bundle: false,
      limit: 3,
      timeout: UPLOAD_IDLE_TIMEOUT_MS,
      withCredentials: false,
      // Only these explicitly constructed API fields; per-file queueId stays local.
      allowedMetaFields: Object.keys(metadata),
      headers: { Authorization: `Bearer ${settings.token}` },
      shouldRetry: () => false,
      onBeforeRequest: (xhr, _retry, files) => {
        requests.set(
          xhr,
          files.map((file) => file.id),
        );
        files.forEach((file) =>
          this.update(file.id, {
            state: 'uploading',
            visibility,
            siteUrl: settings.siteUrl,
            progress: 0,
          }),
        );
      },
      onAfterResponse: (xhr) => {
        let body: unknown;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        const result =
          xhr.responseURL && xhr.responseURL !== target
            ? {
                state: 'unknown' as const,
                message: '上传发生重定向，结果待核对。请使用站点最终根地址。',
                visibility,
              }
            : parseUploadResponse(
                xhr.status,
                body,
                settings.linkVersion,
                visibility,
              );
        requests.get(xhr)?.forEach((id) => this.update(id, result));
      },
      getResponseData: (xhr) => {
        try {
          const body = JSON.parse(xhr.responseText);
          return body && typeof body === 'object' ? body : {};
        } catch {
          return {};
        }
      },
    });
    uppy.on('upload-progress', (file, progress) => {
      if (!file) return;
      const item = this.snapshot.items.find((item) => item.id === file.id);
      if (!item || !ACTIVE.includes(item.state)) return;
      const percent = progress.bytesTotal
        ? Math.min(
            100,
            Math.round((progress.bytesUploaded / progress.bytesTotal) * 100),
          )
        : 0;
      this.update(file.id, {
        progress: percent,
        state: percent === 100 ? 'processing' : 'uploading',
      });
    });
    uppy.on('upload-error', (file, error) => {
      const item = this.snapshot.items.find((item) => item.id === file?.id);
      if (item && ACTIVE.includes(item.state))
        this.update(item.id, {
          state: 'unknown',
          errorCode: 'UPLOAD_TRANSPORT_ERROR',
          stage: item.state === 'processing' ? 'waiting' : 'transferring',
          message: `${diagnostic(error.message)}；Ariso 可能已接收图片。请先核对图库，不要直接重传。`,
        });
    });
    try {
      for (const item of batch)
        uppy.addFile({
          name: item.name,
          type: this.files.get(item.id)!.type,
          data: this.files.get(item.id)!,
          meta: { ...metadata, queueId: item.id },
        });
      this.publish(undefined, true);
      await uppy.upload();
    } catch (error) {
      batch.forEach((item) => {
        const current = this.snapshot.items.find(
          (candidate) => candidate.id === item.id,
        );
        if (current && ACTIVE.includes(current.state))
          this.update(item.id, {
            state: 'unknown',
            errorCode: 'UPLOAD_CLIENT_ERROR',
            stage: 'client',
            message: `${diagnostic(error)}；上传结果未确认，请到 Ariso 图库核对。`,
          });
      });
      // Expected HTTP/transport errors have already become per-file results.
      if (
        batch.every(
          (item) =>
            this.snapshot.items.find((current) => current.id === item.id)
              ?.state === 'queued',
        )
      )
        throw new Error(
          error instanceof Error ? error.message : '无法开始上传',
        );
    } finally {
      uppy.destroy();
      if (this.active === uppy) {
        this.active = null;
        this.publish(undefined, false);
      }
    }
  }
  stop() {
    if (!this.active) return;
    this.publish(
      this.snapshot.items.map((item) =>
        ACTIVE.includes(item.state)
          ? {
              ...item,
              state: 'unknown',
              message:
                '已停止客户端传输，服务器可能已经接收图片。请先核对图库。',
            }
          : item,
      ),
    );
    this.active.cancelAll();
  }
  destroy() {
    this.stop();
    this.active?.destroy();
    this.active = null;
    this.snapshot.items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    this.files.clear();
    this.listeners.clear();
  }
}
