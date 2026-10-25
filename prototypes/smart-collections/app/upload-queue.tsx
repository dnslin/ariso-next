'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Label,
  ListBox,
  Modal,
  Popover,
  ProgressBar,
  Select,
} from '@heroui/react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  CloudUpload,
  Copy,
  Eye,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useDemo } from './providers';

export type UploadDraft = {
  storage: string;
  visibility: 'public' | 'private';
  albums: string[];
  tags: string[];
};
export type SampleFile = {
  key: string;
  name: string;
  src: string;
  bytes: number;
  targetId: string;
  kind: 'new' | 'duplicate' | 'trash' | 'failure';
};
export type QueueItem = SampleFile & {
  id: string;
  state:
    | 'queued'
    | 'uploading'
    | 'checking'
    | 'processing'
    | 'ready'
    | 'duplicate'
    | 'trash'
    | 'failed';
  progress: number;
  draft?: UploadDraft;
  resultId?: string;
};
export const sizeLabel = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
export const terminal = (item: QueueItem) =>
  ['ready', 'duplicate', 'trash', 'failed'].includes(item.state);

function RelationField({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Popover>
        <Button
          variant="outline"
          aria-label={`选择${label}`}
          className="min-h-11 w-full justify-between rounded-lg px-3 font-normal"
        >
          <span className="truncate">
            {value.length ? value.join('、') : `选择${label}`}
          </span>
          <ChevronDown size={16} aria-hidden />
        </Button>
        <Popover.Content className="w-72 max-w-[calc(100vw-32px)] rounded-xl border border-border bg-surface p-2">
          <Popover.Dialog aria-label={`选择${label}`}>
            <ListBox
              aria-label={`${label}列表`}
              selectionMode="multiple"
              selectionBehavior="toggle"
              selectedKeys={value}
              onSelectionChange={(keys) =>
                onChange(
                  keys === 'all'
                    ? choices
                    : choices.filter((name) => keys.has(name)),
                )
              }
            >
              {choices.map((name) => (
                <ListBox.Item
                  key={name}
                  id={name}
                  textValue={name}
                  className="min-h-11 rounded-lg"
                >
                  {name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

export function UploadSettingsCard({
  draft,
  onChange,
  started,
}: {
  draft: UploadDraft;
  onChange: (next: UploadDraft) => void;
  started: boolean;
}) {
  return (
    <Card className="gap-5 rounded-[20px] border border-border bg-surface p-5 shadow-none md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">
          {started ? '下一次上传设置' : '本次上传设置'}
        </h2>
        <Popover>
          <Button
            isIconOnly
            variant="ghost"
            aria-label="上传设置说明"
            className="size-11 rounded-lg text-muted"
          >
            <CircleHelp size={18} aria-hidden />
          </Button>
          <Popover.Content className="max-w-[calc(100vw-32px)] rounded-xl border border-border bg-surface p-4">
            <Popover.Dialog
              aria-label="上传设置说明"
              className="max-w-72 text-sm leading-6"
            >
              开始时固定本次设置。修改只影响下一次上传，重复图片保留原来的名称、标签和可见性。
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
      <Select
        value={draft.storage}
        onChange={(key) => key && onChange({ ...draft, storage: String(key) })}
      >
        <Label>存储位置</Label>
        <Select.Trigger className="min-h-11 rounded-lg">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {['本地存储', 'Cloudflare R2'].map((name) => (
              <ListBox.Item
                key={name}
                id={name}
                textValue={name}
                className="min-h-11"
              >
                {name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Select
        value={draft.visibility}
        onChange={(key) =>
          (key === 'public' || key === 'private') &&
          onChange({ ...draft, visibility: key })
        }
      >
        <Label>可见性</Label>
        <Select.Trigger className="min-h-11 rounded-lg">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="public" textValue="公开" className="min-h-11">
              公开
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id="private" textValue="私有" className="min-h-11">
              私有
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
      <RelationField
        label="相册"
        choices={['旅行记录', '设计参考', '工作资料']}
        value={draft.albums}
        onChange={(albums) => onChange({ ...draft, albums })}
      />
      <RelationField
        label="标签"
        choices={['截图', '风景', '工作']}
        value={draft.tags}
        onChange={(tags) => onChange({ ...draft, tags })}
      />
      <div className="flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted">
        <Copy size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>完全相同的文件自动跳过。已有图片的设置保持不变。</span>
      </div>
    </Card>
  );
}

const labels: Record<QueueItem['state'], string> = {
  queued: '等待开始',
  uploading: '正在传输',
  checking: '检查重复',
  processing: '图片处理中',
  ready: '新增成功',
  duplicate: '重复跳过',
  trash: '重复跳过',
  failed: '上传失败',
};

function QueueRow({
  item,
  wasRestored,
  onView,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  wasRestored: boolean;
  onView: (id: string) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const complete = terminal(item);
  const duplicate = item.state === 'duplicate' || item.state === 'trash';
  const Icon =
    item.state === 'ready'
      ? CheckCircle2
      : item.state === 'failed'
        ? CircleAlert
        : duplicate
          ? Copy
          : CloudUpload;
  const color =
    item.state === 'ready'
      ? 'success'
      : item.state === 'failed'
        ? 'danger'
        : 'default';
  return (
    <li
      className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0"
      data-upload-state={item.state}
      data-upload-name={item.name}
      data-upload-id={item.id}
    >
      <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] items-center gap-3 min-[1100px]:grid-cols-[64px_minmax(0,1fr)_132px]">
        {/* Local fixture images are intentionally displayed directly in this prototype. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src}
          alt=""
          className="size-14 rounded-lg object-cover min-[1100px]:size-16"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 [overflow-wrap:anywhere]">
            {item.name}
          </p>
          <p className="mt-1 text-xs text-muted">{sizeLabel(item.bytes)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip
              size="sm"
              variant="soft"
              color={color}
              className="h-auto min-h-6 gap-1 py-0.5 text-xs"
            >
              <Icon size={13} aria-hidden />
              {labels[item.state]}
            </Chip>
            {item.state === 'ready' && (
              <span className="text-xs text-muted">
                {item.draft?.visibility === 'private' ? '私有' : '公开'}
              </span>
            )}
          </div>
          {duplicate && (
            <p className="mt-2 text-xs leading-5 text-muted">
              {wasRestored
                ? '已有图片已恢复到图库，本次未新增。'
                : item.state === 'trash'
                  ? '回收站已有相同图片，未新增。'
                  : '图片已存在，未新增。'}
            </p>
          )}
          {item.state === 'failed' && (
            <p role="alert" className="mt-2 text-xs leading-5 text-danger">
              文件传输中断，未创建图片。
            </p>
          )}
        </div>
        <div className="col-start-2 flex flex-wrap gap-2 min-[1100px]:col-start-auto min-[1100px]:justify-end">
          {item.state === 'queued' ? (
            <Button
              variant="ghost"
              isIconOnly
              aria-label={`移除 ${item.name}`}
              className="size-11 rounded-lg text-muted"
              onPress={onRemove}
            >
              <X size={17} aria-hidden />
            </Button>
          ) : item.state === 'failed' ? (
            <Button
              variant="outline"
              className="min-h-11 rounded-lg px-3 text-xs"
              onPress={onRetry}
            >
              <RotateCcw size={15} aria-hidden />
              重试上传
            </Button>
          ) : complete && item.resultId ? (
            <Button
              variant="outline"
              className="min-h-11 rounded-lg px-3 text-xs"
              onPress={() => onView(item.resultId!)}
            >
              <Eye size={15} aria-hidden />
              {item.state === 'trash' && !wasRestored
                ? '查看回收记录'
                : duplicate
                  ? '查看已有图片'
                  : '查看图片'}
            </Button>
          ) : null}
        </div>
      </div>
      {!complete && item.state !== 'queued' && (
        <ProgressBar
          aria-label={`${item.name} 传输进度`}
          value={item.progress}
          className="gap-1"
        >
          <ProgressBar.Output className="text-xs text-muted" />
          <ProgressBar.Track className="h-1.5">
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      )}
    </li>
  );
}

export function UploadQueue({
  items,
  onChoose,
  onView,
  onRetry,
  onRemove,
}: {
  items: QueueItem[];
  onChoose: () => void;
  onView: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { images } = useDemo();
  if (!items.length)
    return (
      <Card className="min-h-70 items-center justify-center gap-4 rounded-[20px] border border-dashed border-border bg-surface p-6 text-center shadow-none md:min-h-90">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-default">
          <CloudUpload size={34} aria-hidden />
        </span>
        <h2 className="text-xl font-medium min-[1200px]:text-[28px]">
          选择要上传的图片
        </h2>
        <Button className="h-12 min-w-40 rounded-lg" onPress={onChoose}>
          选择示例图片
        </Button>
        <p className="text-xs text-muted">
          支持多选 · 示例文件不会上传到服务器
        </p>
      </Card>
    );
  const pending = items.filter((item) => item.state === 'queued').length;
  return (
    <Card className="min-w-0 gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">
          {pending ? `待上传 ${pending} 张` : `共 ${items.length} 张`}
        </h2>
        <Button
          variant="outline"
          className="min-h-11 rounded-lg px-3"
          onPress={onChoose}
        >
          <Plus size={16} aria-hidden />
          继续添加
        </Button>
      </div>
      <ul
        className="m-0 grid list-none divide-y divide-border p-0"
        aria-label="上传队列"
      >
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            wasRestored={
              item.state === 'trash' &&
              images.some(
                (image) => image.id === item.resultId && !image.trashed,
              )
            }
            onView={onView}
            onRetry={() => onRetry(item.id)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </ul>
    </Card>
  );
}

export function SamplePicker({
  open,
  onOpenChange,
  samples,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples: SampleFile[];
  onAdd: (samples: SampleFile[]) => void;
}) {
  const [selected, setSelected] = useState(
    () => new Set(samples.map((sample) => sample.key)),
  );
  const descriptions = {
    new: '新文件',
    duplicate: '与图库中的湖泊照片完全相同',
    trash: '与回收站的日落照片完全相同',
    failure: '演示传输失败，可单独重试',
  };
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container placement="center" className="p-4">
        <Modal.Dialog className="max-h-[calc(100dvh-32px)] w-full max-w-140 gap-4 overflow-y-auto rounded-[14px] border border-border bg-surface p-5 md:p-6">
          <Modal.Header className="flex flex-row items-center justify-between gap-3">
            <Modal.Heading className="text-xl font-medium">
              选择示例图片
            </Modal.Heading>
            <Button
              isIconOnly
              variant="ghost"
              className="size-11 rounded-lg"
              aria-label="关闭图片选择"
              onPress={() => onOpenChange(false)}
            >
              <X size={20} aria-hidden />
            </Button>
          </Modal.Header>
          <Modal.Body className="m-0 grid gap-2 p-0">
            {samples.map((sample) => (
              <Checkbox
                key={sample.key}
                aria-label={sample.name}
                isSelected={selected.has(sample.key)}
                onChange={(checked) =>
                  setSelected((previous) => {
                    const next = new Set(previous);
                    if (checked) next.add(sample.key);
                    else next.delete(sample.key);
                    return next;
                  })
                }
                className="w-full max-w-none rounded-xl border border-border p-0 data-[selected=true]:bg-default"
              >
                <Checkbox.Content className="flex min-h-20 w-full min-w-0 items-center gap-3 p-3">
                  <Checkbox.Control className="size-4 shrink-0">
                    <Checkbox.Indicator>
                      <Check size={14} aria-hidden />
                    </Checkbox.Indicator>
                  </Checkbox.Control>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sample.src}
                    alt=""
                    className="size-12 shrink-0 rounded-lg object-cover"
                  />
                  <span className="grid min-w-0 gap-1">
                    <span className="text-sm font-medium [overflow-wrap:anywhere]">
                      {sample.name}
                    </span>
                    <span className="text-xs leading-5 text-muted">
                      {descriptions[sample.kind]}
                    </span>
                  </span>
                </Checkbox.Content>
              </Checkbox>
            ))}
          </Modal.Body>
          <Modal.Footer className="mt-1 flex gap-3">
            <Button
              variant="outline"
              className="h-12 flex-1 rounded-lg"
              onPress={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              className="h-12 flex-1 rounded-lg"
              isDisabled={!selected.size}
              onPress={() => {
                onAdd(samples.filter((sample) => selected.has(sample.key)));
                onOpenChange(false);
              }}
            >
              加入队列（{selected.size}）
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
