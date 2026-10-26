'use client';

import Image from 'next/image';
import { useRef } from 'react';
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
import { type QueueItem, type Visibility, sizeLabel } from './model';
import { Choice, primary } from './ui';

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
const formats = [
  ['url', 'URL'],
  ['markdown', 'Markdown'],
  ['html', 'HTML'],
] as const;

export function QueuePanel({
  items,
  busy,
  connected,
  visibility,
  format,
  onFormat,
  onFiles,
  onRemove,
  onClear,
  onStart,
  onStop,
  onCopy,
  onReview,
  onUseOriginal,
}: {
  items: QueueItem[];
  busy: boolean;
  connected: boolean;
  visibility: Visibility;
  format: string;
  onFormat: (format: string) => void;
  onFiles: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onStart: () => void;
  onStop: () => void;
  onCopy: (items: QueueItem[]) => void;
  onReview: (item: QueueItem) => void;
  onUseOriginal: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = items.filter((item) => item.state === 'queued').length;
  const ready = items.filter(
    (item) => item.state === 'ready' && item.visibility === 'public',
  );
  return (
    <section aria-label="上传队列">
      <div
        className={`${items.length ? 'mx-4 my-3 min-h-14 px-4 py-1' : 'm-4 min-h-48 p-4'} flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-default/20 text-center transition-colors hover:bg-default/40 motion-reduce:transition-none`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          onFiles(event.dataTransfer.files);
        }}
        data-testid="drop-zone"
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
          className={`${items.length ? 'min-h-11 rounded-lg bg-transparent px-4 text-sm text-foreground' : `${primary} mt-4`}`}
          variant={items.length ? 'ghost' : 'primary'}
          onPress={() => input.current?.click()}
        >
          <Plus size={16} />
          {items.length ? '添加图片' : '选择图片'}
        </Button>
        <input
          ref={input}
          aria-label="选择本地图片"
          type="file"
          accept="image/*,.heic,.heif,.avif,.tif,.tiff"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) onFiles(event.target.files);
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
              const inFlight = ['uploading', 'processing'].includes(item.state);
              const needsReview = [
                'unknown',
                'duplicate',
                'failed',
                'version-unavailable',
              ].includes(item.state);
              return (
                <li
                  key={item.id}
                  data-state={item.state}
                  className="flex items-center gap-2.5 px-4 py-2"
                >
                  <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-default/40">
                    {item.src && !/\.(heic|heif|tiff?)$/i.test(item.name) ? (
                      <Image
                        src={item.src}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="size-full object-cover"
                      />
                    ) : (
                      <FileImage size={20} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-xs font-medium"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <p
                      className={`mt-1 flex items-center gap-1 text-[11px] ${['unknown', 'failed', 'version-unavailable'].includes(item.state) ? 'text-danger' : 'text-muted'}`}
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
                  </div>
                  {item.state === 'ready' && item.visibility === 'public' ? (
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label={`复制${item.name}链接`}
                      className="size-11 shrink-0 rounded-lg"
                      onPress={() => onCopy([item])}
                    >
                      <Copy size={15} />
                    </Button>
                  ) : item.state === 'version-unavailable' ? (
                    <Button
                      variant="ghost"
                      className="min-h-11 shrink-0 rounded-lg px-1.5 text-xs"
                      onPress={() => onUseOriginal(item.id)}
                    >
                      用原图
                    </Button>
                  ) : needsReview ? (
                    <Button
                      variant="ghost"
                      className="min-h-11 shrink-0 rounded-lg px-1.5 text-xs"
                      aria-label={`查看${item.name}处理建议`}
                      onPress={() => onReview(item)}
                    >
                      详情
                    </Button>
                  ) : (
                    !inFlight && (
                      <Button
                        isIconOnly
                        variant="ghost"
                        aria-label={`移除${item.name}`}
                        className="size-11 shrink-0 rounded-lg text-muted"
                        onPress={() => onRemove(item.id)}
                      >
                        <X size={15} />
                      </Button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="border-t border-border px-4 py-3">
        {busy ? (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted">
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
              />
              正在上传
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
            <VisibilityLabel visibility={visibility} />
            <Button
              className={primary}
              isDisabled={!connected}
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
            <VisibilityLabel visibility={visibility} />
            <span className="text-[11px] text-muted">单图 ≤ 50 MiB</span>
          </div>
        )}
      </div>
    </section>
  );
}

function VisibilityLabel({ visibility }: { visibility: Visibility }) {
  const Icon = visibility === 'public' ? Globe2 : LockKeyhole;
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted">
      <Icon size={12} />
      {visibility === 'public' ? '公开上传' : '私有保存'}
    </span>
  );
}
