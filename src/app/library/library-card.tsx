'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Skeleton } from '@heroui/react/skeleton';
import { ImageOff } from 'lucide-react';
import type { LibraryItem } from '../../server/library/types';

import {
  processingLabels as statuses,
  stepLabels,
} from '../../components/library/detail-labels';

export function LibraryCard({
  item,
  onOpen,
}: {
  item: LibraryItem;
  onOpen?: (id: string, element: HTMLElement) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const placeholder = !item.storage.enabled
    ? '存储已停用'
    : failed
      ? '缩略图读取失败'
      : item.processingStatus === 'ready'
        ? '暂无缩略图'
        : statuses[item.processingStatus];
  return (
    <Card
      data-testid="library-card"
      data-image-id={item.id}
      className="relative h-full min-w-0 gap-0 overflow-hidden rounded-2xl border border-border bg-background p-0 shadow-none"
    >
      <Button
        variant="ghost"
        className="absolute inset-0 z-10 h-full w-full rounded-2xl bg-transparent p-0 hover:bg-transparent"
        aria-label={`查看图片：${item.displayName}`}
        onPress={(event) => {
          if (event.target instanceof HTMLElement)
            onOpen?.(item.id, event.target);
        }}
      />
      <div className="relative flex h-32.5 shrink-0 items-center justify-center bg-default xl:h-47.5">
        {item.thumbnailUrl && !failed ? (
          <>
            {!loaded ? (
              <Skeleton aria-hidden className="absolute inset-0 size-full" />
            ) : null}
            {/* 直接请求 delivery，保留所有者 Cookie 和访问控制。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnailUrl}
              alt={item.displayName}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          </>
        ) : (
          <div className="grid justify-items-center gap-2 px-3 text-center text-xs">
            <ImageOff size={24} aria-hidden="true" />
            <p>{placeholder}</p>
          </div>
        )}
      </div>
      <Card.Content className="grid content-start gap-1.5 p-2.5 text-xs xl:p-3.5 xl:text-sm">
        <p className="break-words">{item.displayName}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] xl:text-xs">
          <Chip size="sm" variant="soft">
            {item.visibility === 'private' ? '私有' : '公开'}
          </Chip>
          <span>
            {(item.byteSize / 1048576).toFixed(1)} MiB ·{' '}
            {statuses[item.processingStatus]}
          </span>
        </div>
        <p className="text-[11px] text-muted xl:text-xs">
          {item.format === 'unknown' ? '格式待识别' : item.format.toUpperCase()}{' '}
          · {item.storage.name}
          {!item.storage.enabled ? '（已停用）' : ''}
        </p>
        {item.activeJob ? (
          <p className="text-[11px] xl:text-xs">
            当前任务：
            {item.activeJob.status === 'queued' ? '等待执行' : '执行中'} ·{' '}
            {stepLabels[item.activeJob.step] ?? item.activeJob.step}
          </p>
        ) : null}
        {item.latestFailedJob ? (
          <p className="text-[11px] text-danger xl:text-xs">
            最近任务失败 ·{' '}
            {stepLabels[item.latestFailedJob.step] ?? item.latestFailedJob.step}
          </p>
        ) : null}
      </Card.Content>
    </Card>
  );
}
