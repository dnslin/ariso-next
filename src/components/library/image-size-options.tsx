'use client';

import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { Spinner } from '@heroui/react/spinner';
import { sizePresets, type SizePreset } from '../../server/media/size-types';
import type { ImageSizeLinks } from './use-image-size-links';

export function ImageSizeOptions({
  preset,
  onChange,
  compatible,
  disabled,
  sizes,
}: {
  preset: SizePreset | 'native';
  onChange: (value: SizePreset | 'native') => void;
  compatible: boolean;
  disabled: boolean;
  sizes: ImageSizeLinks;
}) {
  return (
    <Select
      value={compatible ? preset : 'native'}
      isDisabled={!compatible || disabled || sizes.pending}
      onChange={(key) => {
        if (key !== null) onChange(String(key) as SizePreset | 'native');
      }}
    >
      <Label>图片尺寸</Label>
      <Select.Trigger
        data-testid="detail-copy-size"
        className="min-h-12 rounded-lg border border-border bg-background text-sm shadow-none dark:bg-surface"
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item
            id="native"
            textValue="当前版本尺寸"
            className="min-h-11"
          >
            当前版本尺寸
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {Object.entries(sizePresets).map(([id, edge]) => (
            <ListBox.Item
              key={id}
              id={id}
              textValue={`最长边 ${edge} px`}
              className="min-h-11"
            >
              最长边 {edge} px
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function ImageSizeFeedback({
  compatible,
  preset,
  sizes,
}: {
  compatible: boolean;
  preset: SizePreset | 'native';
  sizes: ImageSizeLinks;
}) {
  const result = sizes.result;
  if (!compatible)
    return (
      <p className="text-xs leading-6 text-muted">
        尺寸预设仅用于已保存的静态压缩图或水印图；原图保留原始文件内容。
      </p>
    );
  if (preset === 'native') return null;
  return (
    <div className="grid gap-2">
      {sizes.pending ? (
        <p
          role="status"
          className="flex items-center gap-2 text-[13px] text-muted"
        >
          <Spinner size="sm" />
          {sizes.generating
            ? '正在生成尺寸图片，关闭后已受理的任务会继续。'
            : '正在读取尺寸状态…'}
        </p>
      ) : null}
      {result?.width && result.height ? (
        <p className="text-xs text-muted">
          {result.status === 'ready' ? '实际输出' : '预计输出'} {result.width} ×{' '}
          {result.height} px · 等比缩小，不裁剪、不放大
        </p>
      ) : null}
      {sizes.error || result?.error ? (
        <p
          role="alert"
          className="text-[13px] text-danger [overflow-wrap:anywhere]"
        >
          {sizes.error ?? result?.error}
        </p>
      ) : null}
      {!sizes.pending && result?.status !== 'ready' ? (
        <p className="text-xs text-muted">
          此尺寸尚未就绪。生成成功后才可复制链接，剪贴板保持原内容。
        </p>
      ) : null}
    </div>
  );
}
