'use client';
import {
  Archive,
  CircleCheck,
  Cloud,
  FolderHeart,
  HardDrive,
  Image as ImageIcon,
  LockKeyhole,
} from 'lucide-react';
import type { BackupSummary } from '../../server/backup/manifest';
import { bytesLabel } from '../library/detail-labels';
import { IdentityField } from '../identity/identity-field';
import type { RestoreRemoteTarget } from '../../server/backup/restore-remote-types';

function RestoreStorages({
  summary,
  destinations = false,
  localOnly = false,
  targets = [],
}: {
  summary: BackupSummary;
  destinations?: boolean;
  localOnly?: boolean;
  targets?: RestoreRemoteTarget[];
}) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {summary.storages
        .filter((storage) => !localOnly || storage.type === 'local')
        .map((storage) => (
          <div key={storage.id} className="flex items-start gap-3 p-4">
            {storage.type === 'local' ? (
              <HardDrive className="mt-0.5 size-5 shrink-0" aria-hidden />
            ) : (
              <Cloud className="mt-0.5 size-5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium wrap-anywhere">
                {storage.name}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {destinations && storage.type === 'local'
                  ? '新实例本地目录 · '
                  : `${storage.images.toLocaleString('zh-CN')} 张 · `}
                {bytesLabel(storage.bytes)}
                {storage.enabled ? '' : ' · 保留停用状态'}
              </p>
              {destinations && storage.type === 'local' ? (
                <p className="mt-1 text-xs leading-5 text-muted">
                  恢复到新实例的数据目录，保留原存储归属。
                </p>
              ) : null}
              {destinations && storage.type === 's3'
                ? (() => {
                    const target = targets.find(
                      (item) => item.storageId === storage.id,
                    );
                    return target ? (
                      <p className="mt-1 text-xs leading-5 text-muted wrap-anywhere">
                        {target.endpoint} / {target.bucket} / {target.namespace}
                      </p>
                    ) : null;
                  })()
                : null}
            </div>
            <span className="text-xs text-muted">
              {storage.type === 's3'
                ? 'S3'
                : destinations
                  ? '无需配置'
                  : '本地'}
            </span>
          </div>
        ))}
    </div>
  );
}
export function RestoreReview({
  summary,
  fileName,
}: {
  summary: BackupSummary;
  fileName: string;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-3 rounded-xl bg-default/60 p-4">
        <Archive className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="break-all text-sm font-medium">
            {fileName || summary.siteName}
          </p>
          <p className="mt-1 text-xs text-muted">
            已解密 · Ariso {summary.application.version}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <div>
          <dt className="text-xs text-muted">图片</dt>
          <dd className="mt-1 text-2xl font-medium">
            {summary.images.toLocaleString('zh-CN')}
            <span className="ml-1.5 text-sm font-normal">张</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">文件总大小</dt>
          <dd className="mt-1 text-2xl font-medium">
            {bytesLabel(summary.bytes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">相册与标签</dt>
          <dd className="mt-1 text-sm">
            {summary.albums} 个相册 · {summary.tags} 个标签
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">包含回收站</dt>
          <dd className="mt-1 text-sm">{summary.trashedImages} 张图片</dd>
        </div>
      </dl>
      <section className="grid gap-3" aria-labelledby="restore-storage-list">
        <h2 id="restore-storage-list" className="text-sm font-medium">
          保留原存储划分
        </h2>
        <RestoreStorages summary={summary} />
      </section>
      <p className="flex items-center gap-2 text-sm" role="status">
        <CircleCheck className="size-4 shrink-0" aria-hidden />
        备份已解密，应用版本匹配
      </p>
      <p className="text-xs leading-relaxed text-muted">
        恢复时会逐项检查文件内容。原图、已有处理版本、站点配置和素材都来自备份，无需连接原服务器。
      </p>
    </div>
  );
}
export function RestoreLocalTargets({
  summary,
  publicUrl,
  error,
  busy,
  onUrl,
}: {
  summary: BackupSummary;
  publicUrl: string;
  error?: string;
  busy: boolean;
  onUrl: (value: string) => void;
}) {
  return (
    <div className="grid gap-6">
      <IdentityField
        name="publicUrl"
        label="恢复后的站点地址"
        value={publicUrl}
        onChange={onUrl}
        error={error}
        isDisabled={busy}
        description="继续使用原域名并切换解析后，原图片链接可以沿用。"
      />
      {summary.storages.some((storage) => storage.type === 'local') ? (
        <RestoreStorages summary={summary} destinations localOnly />
      ) : null}
      <p className="text-xs leading-6 text-muted">
        本地文件恢复到新实例已配置的数据目录，保留原存储归属与启用状态。
      </p>
    </div>
  );
}
export function RestoreConfirmation({
  summary,
  publicUrl,
  targets = [],
}: {
  summary: BackupSummary;
  publicUrl: string;
  targets?: RestoreRemoteTarget[];
}) {
  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-sm text-muted">恢复到</h2>
        <p className="mt-2 break-all text-lg font-medium">{publicUrl}</p>
        <p className="mt-1 text-sm text-muted">空白的新实例</p>
      </section>
      <RestoreStorages summary={summary} destinations targets={targets} />
      <ul className="grid gap-3 text-sm">
        <li className="flex gap-2.5">
          <ImageIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          保留图片、相册、标签和原有分享。
        </li>
        <li className="flex gap-2.5">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            保留账号密码和上传 Token；恢复后使用 {summary.ownerEmail} 重新登录。
          </span>
        </li>
        <li className="flex gap-2.5">
          <FolderHeart className="mt-0.5 size-4 shrink-0" aria-hidden />
          不会修改原站数据。复制完成后，需要重启新实例。
        </li>
      </ul>
      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
        站点会回到备份时的状态。备份之后撤销的分享可能重新有效；已过期分享仍然过期。
      </p>
    </div>
  );
}
