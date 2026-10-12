'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Check } from 'lucide-react';
import { BatchThumbnail } from '../../components/library/batch-targets';
import type { LibraryItem } from '../../server/library/types';

export function AlbumImageChoice({
  item,
  existing,
  selected,
  disabled,
  onToggle,
}: {
  item: LibraryItem;
  existing: boolean;
  selected: boolean;
  disabled: boolean;
  onToggle: (item: LibraryItem) => void;
}) {
  const [failedPreview, setFailedPreview] = useState<string>();
  const unreadable = !!item.thumbnailUrl && failedPreview === item.thumbnailUrl;
  const placeholder = !item.storage.enabled
    ? '存储已停用'
    : unreadable
      ? '缩略图读取失败'
      : !item.thumbnailUrl
        ? '暂无缩略图'
        : null;
  const locked = disabled || existing;
  return (
    <article
      data-testid="album-image-choice"
      data-image-id={item.id}
      data-existing={existing || undefined}
      data-selected={selected || undefined}
      className="relative min-w-0"
    >
      <Button
        variant="ghost"
        data-image-choice-open
        isDisabled={locked}
        aria-label={`${existing ? '已添加' : selected ? '取消选择' : '选择'}图片：${item.displayName}`}
        className={`grid h-auto w-full min-w-0 justify-normal gap-2 rounded-lg bg-transparent p-0 text-left font-normal hover:bg-transparent ${existing ? 'opacity-60' : ''}`}
        onPress={() => onToggle(item)}
      >
        <span
          className={`relative block aspect-[4/3] w-full overflow-hidden rounded-lg border-2 ${selected ? 'border-accent' : 'border-transparent'}`}
          onErrorCapture={() => {
            if (item.thumbnailUrl) setFailedPreview(item.thumbnailUrl);
          }}
        >
          <BatchThumbnail
            key={item.thumbnailUrl}
            url={item.storage.enabled && !unreadable ? item.thumbnailUrl : null}
            className="size-full"
          />
          {placeholder ? (
            <span className="absolute right-2 bottom-2 left-2 break-words text-center text-xs font-normal">
              {placeholder}
            </span>
          ) : null}
        </span>
        <span className="w-full truncate text-sm" title={item.displayName}>
          {item.displayName}
        </span>
      </Button>
      {existing ? (
        <span className="pointer-events-none absolute top-3 right-3 flex items-center gap-1 rounded-md bg-surface/95 px-2 py-1 text-xs">
          <Check size={13} aria-hidden />
          已添加
        </span>
      ) : (
        <Checkbox
          aria-label={`选择图片：${item.displayName}`}
          isSelected={selected}
          isDisabled={locked}
          onChange={() => onToggle(item)}
          className="absolute top-1 left-1 z-20"
        >
          <Checkbox.Content className="flex size-11 items-center justify-center rounded-lg">
            <Checkbox.Control className="size-5 border border-border bg-surface shadow-sm">
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Content>
        </Checkbox>
      )}
    </article>
  );
}
