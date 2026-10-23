'use client';

import { Alert } from '@heroui/react/alert';
import {
  Cloud,
  HardDrive,
  CircleCheck,
  Archive,
  LockKeyhole,
  Image as ImageIcon,
  FolderHeart,
} from 'lucide-react';
import type { RestoreScope, RestoreTarget } from './restore-data';

export function RestoreReview({
  scope,
  fileName,
  mismatch,
}: {
  scope: RestoreScope;
  fileName: string;
  mismatch: boolean;
}) {
  const mixed = scope === 'mixed';
  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-3 rounded-xl bg-default/60 p-4">
        <Archive className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="break-all text-sm font-medium">{fileName}</p>
          <p className="mt-1 text-xs text-muted">
            2026 年 10 月 22 日 10:30 · 已解密
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <div>
          <dt className="text-xs text-muted">图片</dt>
          <dd className="mt-1 text-2xl font-medium">
            {mixed ? '1,248' : '248'}
            <span className="ml-1.5 text-sm font-normal">张</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">文件总大小</dt>
          <dd className="mt-1 text-2xl font-medium">
            {mixed ? '8.6' : '1.2'}
            <span className="ml-1.5 text-sm font-normal">GB</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">相册与标签</dt>
          <dd className="mt-1 text-sm">
            {mixed ? '18 个相册 · 32 个标签' : '6 个相册 · 12 个标签'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">包含回收站</dt>
          <dd className="mt-1 text-sm">{mixed ? '24' : '8'} 张图片</dd>
        </div>
      </dl>
      <section className="grid gap-3" aria-labelledby="backup-storage-list">
        <h2 id="backup-storage-list" className="text-sm font-medium">
          保留原存储划分
        </h2>
        <div className="divide-y divide-border rounded-xl border border-border">
          {[
            { name: '本地图库', detail: '248 张 · 1.2 GB', local: true },
            ...(mixed
              ? [
                  { name: '旅行照片', detail: '680 张 · 4.8 GB', local: false },
                  { name: '作品归档', detail: '320 张 · 2.6 GB', local: false },
                ]
              : []),
          ].map((storage) => (
            <div
              key={storage.name}
              className="flex items-center gap-3 px-4 py-3"
            >
              {storage.local ? (
                <HardDrive className="size-5 shrink-0" aria-hidden />
              ) : (
                <Cloud className="size-5 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">{storage.name}</p>
                <p className="mt-1 text-xs text-muted">{storage.detail}</p>
              </div>
              <span className="text-xs text-muted">
                {storage.local ? '本地' : 'S3'}
              </span>
            </div>
          ))}
        </div>
      </section>
      {mismatch ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>应用版本不匹配</Alert.Title>
            <Alert.Description>
              请先安装这份备份对应的 Ariso
              版本，再进行恢复。当前实例尚未写入任何数据。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : (
        <p className="flex items-center gap-2 text-sm" role="status">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          备份完整，应用版本匹配
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted">
        原图、已有处理版本、站点配置和素材均包含在内，无需连接原服务器。
      </p>
    </div>
  );
}

export function RestoreConfirmation({
  scope,
  publicUrl,
  targets,
}: {
  scope: RestoreScope;
  publicUrl: string;
  targets: RestoreTarget[];
}) {
  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-sm text-muted">恢复到</h2>
        <p className="mt-2 break-all text-lg font-medium">{publicUrl}</p>
        <p className="mt-1 text-sm text-muted">空白的新实例</p>
      </section>
      <div className="divide-y divide-border rounded-xl border border-border">
        <div className="flex items-start gap-3 p-4">
          <HardDrive className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium">本地图库</p>
            <p className="mt-1 text-xs text-muted">新实例本地目录 · 1.2 GB</p>
          </div>
        </div>
        {scope === 'mixed'
          ? targets.map((target) => (
              <div key={target.id} className="flex items-start gap-3 p-4">
                <Cloud className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{target.name}</p>
                  <p className="mt-1 break-all text-xs text-muted">
                    {target.fields.bucket}/{target.fields.pathPrefix} ·{' '}
                    {target.size}
                  </p>
                </div>
                <CircleCheck
                  className="ml-auto size-4 shrink-0"
                  aria-label="连接通过"
                />
              </div>
            ))
          : null}
      </div>
      <ul className="grid gap-3 text-sm">
        <li className="flex gap-2.5">
          <ImageIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          保留图片、相册、标签和原有分享。
        </li>
        <li className="flex gap-2.5">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
          保留账号密码和上传 Token；恢复后重新登录。
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
