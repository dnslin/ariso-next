import { Button } from '@heroui/react';
import { CheckCircle2, CircleAlert, Copy, ExternalLink, X } from 'lucide-react';
import type { UploadItem, VersionKind } from '../lib/types';
import { Dialog, primary, secondary } from './ui';

export type NoticeValue = { text: string; error?: boolean };
export function Notice({
  value,
  onClose,
}: {
  value: NoticeValue | null;
  onClose: () => void;
}) {
  if (!value) return null;
  const Icon = value.error ? CircleAlert : CheckCircle2;
  return (
    <div
      role={value.error ? 'alert' : 'status'}
      className={`flex items-center gap-2 border-t border-border px-3 py-1 text-xs ${value.error ? 'bg-danger/5 text-danger' : 'bg-default/30'}`}
    >
      <Icon size={14} className="shrink-0" />
      <p className="min-w-0 flex-1 leading-5">{value.text}</p>
      <Button
        isIconOnly
        variant="ghost"
        aria-label="关闭提示"
        className="size-11 shrink-0 rounded-lg"
        onPress={onClose}
      >
        <X size={15} />
      </Button>
    </div>
  );
}

const versionNames: Record<VersionKind, string> = {
  original: '原图',
  compressed: '压缩图',
  thumbnail: '缩略图',
  watermark: '水印图',
};
export function ResultDialog({
  item,
  onClose,
  onVersion,
  onCopy,
}: {
  item: UploadItem;
  onClose: () => void;
  onVersion: (kind: VersionKind) => void;
  onCopy: () => void;
}) {
  const gallery = item.siteUrl ? `${item.siteUrl}/library` : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        item.state === 'duplicate'
          ? '图片已存在'
          : item.state === 'version-unavailable'
            ? '图片已保存'
            : item.state === 'unknown'
              ? '先核对上传结果'
              : item.state === 'ready'
                ? '上传结果'
                : '上传未完成'
      }
      footer={
        <Button className={primary} onPress={onClose}>
          知道了
        </Button>
      }
    >
      <p className="break-all text-sm font-medium">{item.name}</p>
      {item.message && <p className="text-sm leading-6">{item.message}</p>}
      {item.state === 'ready' && item.visibility === 'private' && (
        <p className="text-xs leading-5 text-muted">
          图片已私有保存，需要登录 Ariso 才能查看。
        </p>
      )}
      {item.state === 'unknown' && (
        <p className="text-xs leading-5 text-muted">
          Ariso 可能已经接收图片。先查看图库，再决定是否重新选择文件上传。
        </p>
      )}
      {item.state === 'version-unavailable' && item.versions && (
        <div className="grid gap-2">
          <p className="text-xs text-muted">
            选择本次已保存的版本，无需重新上传：
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(item.versions) as VersionKind[]).map((kind) => (
              <Button
                key={kind}
                className={secondary}
                onPress={() => onVersion(kind)}
              >
                {versionNames[kind]}
              </Button>
            ))}
          </div>
        </div>
      )}
      {item.state === 'ready' && item.visibility === 'public' && (
        <Button className={secondary} onPress={onCopy}>
          <Copy size={15} />
          复制链接
        </Button>
      )}
      {gallery && (
        <a
          href={gallery}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
        >
          <ExternalLink size={14} />
          打开 Ariso 图库
        </a>
      )}
      {(item.imageId || item.requestId || item.errorCode || item.stage) && (
        <div className="grid gap-1 border-t border-border pt-3 text-[11px] leading-5 text-muted">
          {item.imageId && <p className="break-all">图片 ID：{item.imageId}</p>}
          {item.requestId && (
            <p className="break-all">请求 ID：{item.requestId}</p>
          )}
          {item.errorCode && (
            <p className="break-all">错误：{item.errorCode}</p>
          )}
          {item.stage && <p>阶段：{item.stage}</p>}
        </div>
      )}
    </Dialog>
  );
}

export function CopyDialog({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="复制下面的内容"
      footer={
        <Button className={primary} onPress={onClose}>
          完成
        </Button>
      }
    >
      <p className="text-xs leading-5 text-muted">
        浏览器未允许自动复制，可以选择下面的内容后手动复制。
      </p>
      <textarea
        aria-label="待复制链接"
        value={text}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
        className="min-h-32 w-full resize-y rounded-lg border border-border bg-default/20 p-3 text-xs break-all"
      />
    </Dialog>
  );
}
