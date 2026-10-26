'use client';

import { Button } from '@heroui/react';
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Globe2,
  X,
} from 'lucide-react';
import { Dialog, primary, secondary } from './ui';
import { type QueueItem, sourceName } from './model';

export function SourcePermissionDialog({
  open,
  onClose,
  onAllow,
}: {
  open: boolean;
  onClose: () => void;
  onAllow: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="允许读取这张网页图片？"
      footer={
        <>
          <Button className={secondary} onPress={onClose}>
            暂不允许
          </Button>
          <Button className={primary} onPress={onAllow}>
            允许并加入队列
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-xl bg-default/45 p-4">
        <Globe2 size={24} />
        <div>
          <p className="text-sm font-medium">{sourceName}</p>
          <p className="mt-1 text-xs text-muted">图片来源网站</p>
        </div>
      </div>
      <p className="text-sm leading-7 text-muted">
        仅访问你选择的图片所在网站。加入队列后，你仍可以检查可见性，再开始上传。
      </p>
      <p className="text-xs text-muted">
        此弹窗模拟浏览器授权，正式扩展使用浏览器原生提示。
      </p>
    </Dialog>
  );
}

export function SourceErrorDialog({
  open,
  onClose,
  onUseLocal,
}: {
  open: boolean;
  onClose: () => void;
  onUseLocal: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="暂时无法获取这张图片"
      footer={
        <>
          <Button className={secondary} onPress={onClose}>
            返回网页
          </Button>
          <Button className={primary} onPress={onUseLocal}>
            改用本地图片
          </Button>
        </>
      }
    >
      <CircleAlert size={32} className="text-danger" />
      <p className="text-sm leading-7">
        来源网站拒绝了图片请求。图片可能需要登录，或存在防盗链限制。
      </p>
      <p className="text-sm leading-6 text-muted">
        本次没有向 Ariso 提交图片。你可以保存图片到本地，再选择或拖入工作台。
      </p>
    </Dialog>
  );
}

export function UploadReviewDialog({
  review,
  onClose,
}: {
  review: QueueItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!review}
      onClose={onClose}
      title={
        review?.state === 'duplicate'
          ? '图片已存在'
          : review?.state === 'version-unavailable'
            ? '图片已保存'
            : review?.state === 'unknown'
              ? '先核对，再决定是否重传'
              : '上传未完成'
      }
      footer={
        <Button className={primary} onPress={onClose}>
          知道了
        </Button>
      }
    >
      <p className="text-sm font-medium break-all">{review?.name}</p>
      <p className="text-sm leading-7 text-muted">{review?.message}</p>
      <p className="text-xs leading-6 text-muted">
        {review?.state === 'duplicate'
          ? '上传 Token 无法读取已有图片链接，请登录 Ariso 图库查看。'
          : review?.state === 'version-unavailable'
            ? '返回队列后可以明确选择“使用已有原图”。'
            : '请在 Ariso 图库中核对实际状态。原型不会自动重试，也不会打开真实后台。'}
      </p>
      <div className="flex items-center gap-2 rounded-lg bg-default/40 p-3 text-xs text-muted">
        <ExternalLink size={14} />
        正式插件将在这里提供图库入口
      </div>
    </Dialog>
  );
}

export function CopyFallbackDialog({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!text}
      onClose={onClose}
      title="复制下面的内容"
      footer={
        <Button className={primary} onPress={onClose}>
          完成
        </Button>
      }
    >
      <p className="text-sm text-muted">
        浏览器未允许自动复制。可以选中文字后手动复制。
      </p>
      <textarea
        aria-label="待复制链接"
        readOnly
        value={text}
        className="min-h-36 w-full resize-y rounded-lg border border-border bg-default/25 p-3 text-sm break-all"
        onFocus={(event) => event.currentTarget.select()}
      />
    </Dialog>
  );
}

export function ResultNotice({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-t border-border bg-default/30 px-3 py-1 text-xs"
    >
      <CheckCircle2 size={14} className="shrink-0" />
      <p className="flex-1 leading-6">{message}</p>
      <Button
        isIconOnly
        variant="ghost"
        aria-label="关闭提示"
        className="size-11 shrink-0 rounded-lg"
        onPress={onClose}
      >
        <X size={16} />
      </Button>
    </div>
  );
}
