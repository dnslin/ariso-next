'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Skeleton } from '@heroui/react/skeleton';
import { ImageOff } from 'lucide-react';
import type { LibraryItem } from '../../server/library/types';
import {
  bytesLabel,
  processingLabels,
} from '../../components/library/detail-labels';

export function CoverChoice({
  item,
  selected,
  disabled,
  onChoose,
}: {
  item: LibraryItem;
  selected: boolean;
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const privateImage = item.visibility === 'private';
  const placeholder = !item.storage.enabled
    ? '存储已停用'
    : failed
      ? '缩略图读取失败'
      : item.processingStatus !== 'ready'
        ? processingLabels[item.processingStatus]
        : '暂无缩略图';
  return (
    <Card
      data-testid="cover-choice"
      data-image-id={item.id}
      data-selected={selected || undefined}
      className={`relative min-w-0 gap-0 overflow-hidden rounded-2xl border border-border bg-background p-0 shadow-none data-[selected=true]:ring-2 data-[selected=true]:ring-focus has-[[data-focus-visible=true]]:ring-2 has-[[data-focus-visible=true]]:ring-focus dark:bg-surface ${privateImage ? 'opacity-55' : ''}`}
    >
      <Button
        variant="ghost"
        isDisabled={disabled || privateImage}
        aria-label={`${privateImage ? '私有图片不可选作封面' : '选择相册封面'}：${item.displayName}`}
        aria-pressed={selected}
        className="absolute inset-0 z-10 h-full w-full rounded-2xl bg-transparent p-0 hover:bg-transparent"
        onPress={() => onChoose(item.id)}
      />
      <div className="relative flex h-32.5 shrink-0 items-center justify-center bg-default min-[1200px]:h-47.5">
        {item.storage.enabled &&
        item.processingStatus === 'ready' &&
        item.thumbnailUrl &&
        !failed ? (
          <>
            {!loaded ? (
              <Skeleton aria-hidden className="absolute inset-0 size-full" />
            ) : null}
            {/* delivery 保留所有者 Cookie 和当前图片权限。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="size-full object-cover"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          </>
        ) : (
          <div className="grid justify-items-center gap-2 px-3 text-center text-xs">
            <ImageOff size={24} aria-hidden />
            <p>{placeholder}</p>
          </div>
        )}
      </div>
      <Card.Content className="grid min-w-0 content-start gap-1.5 px-2.5 pt-3 pb-3 text-xs leading-normal min-[1200px]:px-3.5 min-[1200px]:pb-0 min-[1200px]:text-sm">
        <p className="truncate" title={item.displayName}>
          {item.displayName}
        </p>
        <p className="text-[11px] leading-normal min-[1200px]:text-xs">
          {privateImage
            ? '私有 · 不可选作封面'
            : `公开 · ${bytesLabel(item.byteSize)} · ${processingLabels[item.processingStatus]}`}
        </p>
      </Card.Content>
    </Card>
  );
}
