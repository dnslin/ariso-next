'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Checkbox } from '@heroui/react/checkbox';
import { Chip } from '@heroui/react/chip';
import { Skeleton } from '@heroui/react/skeleton';
import { ImageOff } from 'lucide-react';
import type { LibraryItem } from '../../server/library/types';
import { hasCardDiagnostics } from './gallery-layout';

import {
  processingLabels as statuses,
  stepLabels,
} from '../../components/library/detail-labels';

export function LibraryCard({
  item,
  onOpen,
  imageHeight,
  squareMobileTop = false,
  album = false,
  isDisabled = false,
  isSelected = false,
  onToggle,
}: {
  item: LibraryItem;
  imageHeight?: number;
  squareMobileTop?: boolean;
  album?: boolean;
  isDisabled?: boolean;
  isSelected?: boolean;
  onToggle?: (item: LibraryItem) => void;
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
      data-selected={isSelected || undefined}
      className={`group relative h-full min-w-0 gap-0 overflow-hidden rounded-2xl bg-background p-0 shadow-none data-[selected=true]:ring-2 data-[selected=true]:ring-accent has-[[data-focus-visible=true]]:ring-2 has-[[data-focus-visible=true]]:ring-focus dark:bg-surface ${album ? 'after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-2xl after:border after:border-border' : 'border border-border'} ${squareMobileTop ? 'rounded-t-none min-[1200px]:rounded-t-2xl' : ''}`}
    >
      {onToggle ? (
        <Checkbox
          aria-label={`选择图片：${item.displayName}`}
          isSelected={isSelected}
          isDisabled={isDisabled}
          onChange={() => onToggle(item)}
          className="absolute top-0 left-0 z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[selected=true]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Checkbox.Content className="flex size-11 items-center justify-center">
            <Checkbox.Control className="size-5 border border-border bg-surface shadow-sm">
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Content>
        </Checkbox>
      ) : null}
      <Button
        variant="ghost"
        isDisabled={isDisabled}
        className="absolute inset-0 z-10 h-full w-full rounded-2xl bg-transparent p-0 hover:bg-transparent"
        aria-label={`查看图片：${item.displayName}`}
        onPress={(event) => {
          if (event.target instanceof HTMLElement)
            onOpen?.(item.id, event.target);
        }}
      />
      <div
        className="relative flex h-32.5 shrink-0 items-center justify-center bg-default min-[1200px]:h-47.5"
        style={imageHeight === undefined ? undefined : { height: imageHeight }}
      >
        {item.storage.enabled && item.thumbnailUrl && !failed ? (
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
              draggable={false}
              className="h-full w-full object-contain"
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
      <Card.Content
        className={`grid min-w-0 content-start gap-1.5 px-2.5 pt-3 pb-3 text-xs leading-normal min-[1200px]:px-3.5 min-[1200px]:text-sm ${album ? 'min-[1200px]:pb-0' : ''}`}
      >
        <p className="truncate" title={item.displayName}>
          {item.displayName}
        </p>
        <div className="flex min-w-0 items-center gap-1 text-[11px] leading-normal min-[1200px]:gap-1.5 min-[1200px]:text-xs">
          <Chip
            size="sm"
            variant="soft"
            className="h-auto shrink-0 rounded-full bg-secondary px-1 py-0 text-[11px] leading-normal min-[1200px]:px-1.5 min-[1200px]:text-xs"
          >
            {item.visibility === 'private' ? '私有' : '公开'}
          </Chip>
          <span className="truncate">
            {(item.byteSize / 1048576).toFixed(1)} MiB ·{' '}
            {statuses[item.processingStatus]}
          </span>
        </div>
        {hasCardDiagnostics(item) ? (
          <p
            className="truncate text-[11px] leading-4 text-muted min-[1200px]:text-xs"
            title={`${item.format === 'unknown' ? '格式待识别' : item.format.toUpperCase()} · ${item.storage.name}${!item.storage.enabled ? '（已停用）' : ''}`}
          >
            {item.format === 'unknown'
              ? '格式待识别'
              : item.format.toUpperCase()}{' '}
            · {item.storage.name}
            {!item.storage.enabled ? '（已停用）' : ''}
          </p>
        ) : null}
        {item.activeJob ? (
          <p
            className="truncate text-[11px] leading-4 min-[1200px]:text-xs"
            title={`当前任务：${item.activeJob.status === 'queued' ? '等待执行' : '执行中'} · ${stepLabels[item.activeJob.step] ?? item.activeJob.step}`}
          >
            当前任务：
            {item.activeJob.status === 'queued' ? '等待执行' : '执行中'} ·{' '}
            {stepLabels[item.activeJob.step] ?? item.activeJob.step}
          </p>
        ) : null}
        {item.latestFailedJob ? (
          <p
            className="truncate text-[11px] leading-4 text-danger min-[1200px]:text-xs"
            title={`最近任务失败 · ${stepLabels[item.latestFailedJob.step] ?? item.latestFailedJob.step}`}
          >
            最近任务失败 ·{' '}
            {stepLabels[item.latestFailedJob.step] ?? item.latestFailedJob.step}
          </p>
        ) : null}
      </Card.Content>
    </Card>
  );
}
