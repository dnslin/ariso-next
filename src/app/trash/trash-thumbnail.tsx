'use client';

import { useState } from 'react';
import { Skeleton } from '@heroui/react/skeleton';
import { ImageOff } from 'lucide-react';
import type { TrashItem } from '../../server/library/trash-types';

export function TrashThumbnail({ item }: { item: TrashItem }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const reason = !item.storage.enabled
    ? '存储已停用'
    : item.deletionStatus
      ? item.deletionStatus === 'cleanup_failed'
        ? '清理失败'
        : '正在删除'
      : failed
        ? '预览读取失败'
        : '暂无缩略图';
  return item.thumbnailPath && !failed ? (
    <span className="relative size-14 shrink-0 overflow-hidden rounded-lg md:size-16">
      {!loaded ? (
        <Skeleton aria-hidden className="absolute inset-0 size-full" />
      ) : null}
      {/* The authenticated management route receives the owner cookie directly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-testid="trash-thumbnail"
        src={item.thumbnailPath}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-14 shrink-0 rounded-lg object-cover md:size-16"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </span>
  ) : (
    <span className="flex size-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-default px-1 text-center text-[10px] md:size-16">
      <ImageOff size={18} aria-hidden />
      <span>{reason}</span>
    </span>
  );
}
