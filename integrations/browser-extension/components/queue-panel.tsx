import { useRef, useState } from 'react';
import { Button } from '@heroui/react';
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudUpload,
  Copy,
  FileImage,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  X,
} from 'lucide-react';
import type {
  Capabilities,
  CopyFormat,
  UploadItem,
  UploadSnapshot,
  Visibility,
} from '../lib/types';
import { resultText } from '../lib/output';
import { Choice, primary } from './ui';

const formats = [
  ['url', 'URL'],
  ['markdown', 'Markdown'],
  ['html', 'HTML'],
] as const;
const states = {
  queued: ['待上传', Clock3],
  uploading: ['上传中', CloudUpload],
  processing: ['处理中', LoaderCircle],
  ready: ['已上传', CheckCircle2],
  duplicate: ['已存在，未新增', Copy],
  failed: ['上传失败', CircleAlert],
  unknown: ['结果待核对', CircleAlert],
  'version-unavailable': ['已保存，版本不可用', CircleAlert],
} as const;
export const sizeLabel = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export function QueuePanel({
  snapshot,
  capabilities,
  visibility,
  canStart,
  format,
  onFormat,
  onFiles,
  onRemove,
  onClear,
  onStart,
  onStop,
  onCopy,
  onReview,
  onOriginal,
}: {
  snapshot: UploadSnapshot;
  capabilities: Capabilities;
  visibility: Visibility;
  canStart: boolean;
  format: CopyFormat;
  onFormat: (format: CopyFormat) => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onStart: () => void;
  onStop: () => void;
  onCopy: (items: readonly UploadItem[]) => void;
  onReview: (item: UploadItem) => void;
  onOriginal: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { items, busy } = snapshot;
  const pending = items.filter((item) => item.state === 'queued').length;
  const ready = items.filter((item) => resultText(item, format) !== null);
  const VisibilityIcon = visibility === 'public' ? Globe2 : LockKeyhole;
  return (
    <section aria-label="上传队列">
      <div
        data-testid="drop-zone"
        className={`${items.length ? 'mx-4 my-3 min-h-14 px-4 py-1' : 'm-4 min-h-48 p-4'} flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-default/20 text-center transition-colors hover:bg-default/40 motion-reduce:transition-none`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          onFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {!items.length && (
          <>
            <CloudUpload
              size={26}
              strokeWidth={1.5}
              className="mb-3 text-muted"
            />
            <h2 className="text-sm font-medium">拖入或粘贴图片</h2>
          </>
        )}
        <Button
          className={
            items.length
              ? 'min-h-11 rounded-lg bg-transparent px-4 text-sm text-foreground'
              : `${primary} mt-4`
          }
          variant={items.length ? 'ghost' : 'primary'}
          onPress={() => fileInput.current?.click()}
        >
          <Plus size={16} />
          {items.length ? '添加图片' : '选择图片'}
        </Button>
        <input
          ref={fileInput}
          aria-label="选择本地图片"
          type="file"
          accept="image/*,.heic,.heif,.avif,.tif,.tiff"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) onFiles(Array.from(event.target.files));
            event.target.value = '';
          }}
        />
      </div>
      {items.length > 0 && (
        <>
          <div className="flex h-11 items-center justify-between px-4 text-xs text-muted">
            <span>{items.length} 张图片</span>
            <Button
              variant="ghost"
              isDisabled={busy}
              aria-label="清空图片"
              className="min-h-11 min-w-11 rounded-lg px-2 text-xs"
              onPress={onClear}
            >
              清空
            </Button>
          </div>
          <ul
            className="max-h-56 overflow-y-auto overscroll-contain divide-y divide-border/60"
            aria-live="polite"
          >
            {items.map((item) => {
              const [label, Icon] = states[item.state];
              const inFlight =
                item.state === 'uploading' || item.state === 'processing';
              const review =
                [
                  'failed',
                  'unknown',
                  'duplicate',
                  'version-unavailable',
                ].includes(item.state) || !!item.message;
              return (
                <li
                  key={item.id}
                  data-state={item.state}
                  className="flex items-center gap-2.5 px-4 py-2"
                >
                  <Thumbnail item={item} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-xs font-medium"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <p
                      className={`mt-1 flex items-center gap-1 text-[11px] ${['failed', 'unknown', 'version-unavailable'].includes(item.state) ? 'text-danger' : 'text-muted'}`}
                    >
                      <Icon
                        size={12}
                        className={
                          inFlight
                            ? 'animate-pulse motion-reduce:animate-none'
                            : ''
                        }
                      />
                      {item.state === 'queued'
                        ? sizeLabel(item.bytes)
                        : item.state === 'uploading'
                          ? `上传中 ${item.progress}%`
                          : item.state === 'ready' &&
                              item.visibility === 'private'
                            ? '已私有保存'
                            : label}
                    </p>
                    {item.state === 'uploading' && (
                      <div
                        role="progressbar"
                        aria-label={`${item.name}上传进度`}
                        aria-valuenow={item.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-default"
                      >
                        <div
                          className="h-full bg-foreground transition-[width] motion-reduce:transition-none"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.state === 'failed' && item.message && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-danger">
                        {item.message}
                      </p>
                    )}
                    {item.state === 'unknown' && (
                      <p className="mt-1 text-[11px] text-danger">
                        请先到图库核对
                      </p>
                    )}
                    {item.state === 'ready' &&
                      item.visibility === 'private' && (
                        <p className="mt-1 text-[11px] text-muted">
                          登录 Ariso 后可查看
                        </p>
                      )}
                  </div>
                  {item.state === 'ready' &&
                  item.visibility === 'public' &&
                  !item.message ? (
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label={`复制${item.name}链接`}
                      className="size-11 shrink-0 rounded-lg"
                      onPress={() => onCopy([item])}
                    >
                      <Copy size={15} />
                    </Button>
                  ) : item.state === 'version-unavailable' &&
                    item.versions?.original ? (
                    <Button
                      variant="ghost"
                      className="min-h-11 shrink-0 rounded-lg px-1.5 text-xs"
                      onPress={() => onOriginal(item.id)}
                    >
                      用原图
                    </Button>
                  ) : item.state === 'ready' &&
                    item.visibility === 'private' ? (
                    <Button
                      variant="ghost"
                      className="min-h-11 shrink-0 rounded-lg px-1.5 text-xs"
                      onPress={() => onReview(item)}
                    >
                      查看
                    </Button>
                  ) : review ? (
                    <Button
                      variant="ghost"
                      className="min-h-11 shrink-0 rounded-lg px-1.5 text-xs"
                      aria-label={`查看${item.name}处理建议`}
                      onPress={() => onReview(item)}
                    >
                      详情
                    </Button>
                  ) : item.state === 'queued' ? (
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label={`移除${item.name}`}
                      className="size-11 shrink-0 rounded-lg text-muted"
                      onPress={() => onRemove(item.id)}
                    >
                      <X size={15} />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="border-t border-border px-4 py-3">
        {busy ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs text-muted">
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
              />
              正在上传，请保持小窗打开
            </span>
            <Button
              variant="ghost"
              className="min-h-11 rounded-lg px-2 text-xs"
              onPress={onStop}
            >
              停止
            </Button>
          </div>
        ) : pending > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <VisibilityIcon size={12} />
              {visibility === 'public' ? '公开上传' : '私有保存'}
            </span>
            <Button
              className={primary}
              isDisabled={!canStart}
              onPress={onStart}
            >
              上传 {pending} 张
            </Button>
          </div>
        ) : ready.length > 0 ? (
          <div className="flex items-center gap-2">
            <Choice
              label="复制格式"
              compact
              className="w-28 min-w-0 shrink-0"
              value={format}
              options={formats}
              onChange={onFormat}
            />
            <Button
              className={`${primary} min-w-0 flex-1`}
              onPress={() => onCopy(ready)}
            >
              <Copy size={15} />
              {ready.length === 1 ? '复制链接' : '复制全部链接'}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <VisibilityIcon size={12} />
              {visibility === 'public' ? '公开上传' : '私有保存'}
            </span>
            <span className="text-[11px] text-muted">
              单图 ≤ {sizeLabel(capabilities.maxFileBytes)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function Thumbnail({ item }: { item: UploadItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-default/40">
      {item.previewUrl && !failed ? (
        <img
          src={item.previewUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <FileImage size={20} />
      )}
    </div>
  );
}
