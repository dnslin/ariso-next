'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
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
      className="h-full min-w-0 gap-0 overflow-hidden rounded-2xl border border-border bg-background p-0 shadow-none"
    >
      <div className="flex h-32.5 shrink-0 items-center justify-center bg-default xl:h-47.5">
        {item.thumbnailUrl && !failed ? (
          // 直接请求 delivery；优化代理无法转发所有者 Cookie，也不能替代访问控制。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt={item.displayName}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="grid justify-items-center gap-2 px-3 text-center text-xs">
            <ImageOff size={24} aria-hidden="true" />
            <p>{placeholder}</p>
          </div>
        )}
      </div>
      <Card.Content className="grid content-start gap-1.5 p-2.5 text-xs xl:p-3.5 xl:text-sm">
        <Button
          variant="ghost"
          className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-lg px-0 text-left text-inherit"
          aria-label={`查看图片：${item.displayName}`}
          onPress={(event) => {
            if (event.target instanceof HTMLElement)
              onOpen?.(item.id, event.target);
          }}
        >
          {item.displayName}
        </Button>
        <p className="text-[11px] xl:text-xs">
          {item.visibility === 'private' ? '私有' : '公开'} ·{' '}
          {(item.byteSize / 1048576).toFixed(1)} MiB ·{' '}
          {statuses[item.processingStatus]}
        </p>
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
