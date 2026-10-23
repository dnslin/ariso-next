'use client';
import { Check, Cloud, HardDrive } from 'lucide-react';
import { StorageTip } from '../storage/storage-tip';
import { bytesLabel } from '../library/detail-labels';
import type { BackupScope as Scope } from './use-backups';

export function BackupScope({ scope }: { scope: Scope }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-base font-medium">备份内容</h3>
        <StorageTip label="备份范围">
          包含本地与 S3
          图片的实际文件、已保存版本、回收站图片，以及账号、相册、标签、分享、设置和站点素材。停用存储也包含在内。
        </StorageTip>
      </div>
      <ul className="divide-y divide-border">
        {scope.storages.map((storage) => (
          <li key={storage.id} className="flex items-center gap-3 py-3">
            {storage.type === 'local' ? (
              <HardDrive className="size-5 shrink-0" aria-hidden />
            ) : (
              <Cloud className="size-5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm wrap-anywhere">{storage.name}</p>
              <p className="mt-1 text-xs text-muted">
                {storage.type === 'local' ? '本地存储' : 'S3 存储'} ·{' '}
                {storage.images.toLocaleString('zh-CN')} 张图片
                {storage.enabled ? '' : ' · 已停用'}
              </p>
            </div>
            <span className="shrink-0 text-sm tabular-nums">
              {bytesLabel(storage.bytes)}
            </span>
            <Check
              className="size-4 shrink-0 text-muted"
              aria-label="包含在备份中"
            />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-sm">
        <p>
          共{' '}
          <strong className="font-medium">
            {scope.images.toLocaleString('zh-CN')}
          </strong>{' '}
          张图片
        </p>
        <p>
          约 <strong className="font-medium">{bytesLabel(scope.bytes)}</strong>
        </p>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        服务器可用空间{' '}
        {scope.freeBytes === null ? '暂无法读取' : bytesLabel(scope.freeBytes)}
        ，预计需要 {bytesLabel(scope.estimatedBytes)}。实际大小以生成结果为准。
      </p>
    </section>
  );
}
