'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { QueryClient } from '@tanstack/react-query';
import { Modal } from '@heroui/react/modal';
import { CloseButton } from '@heroui/react/close-button';
import { Link } from '@heroui/react/link';
import { Clock3, Eye, ImageOff } from 'lucide-react';
import { AnalyticsReadError } from './read-analytics';
import { useImageAnalytics } from './use-analytics-query';
import { timestamp } from './presentation';
import { RollingNumber } from './rolling-number';
import {
  ImageStatisticsContent,
  ImageStatisticsTip,
} from './image-statistics-content';

export type ImageStatisticsIdentity = {
  displayName?: string;
  format?: string;
  visibility?: 'public' | 'private';
  recycled?: boolean;
  thumbnailUrl?: string | null;
};

function Thumbnail({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-default md:size-16 md:rounded-xl">
      {src && !failed ? (
        <Image
          src={src}
          unoptimized
          width={64}
          height={64}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOff
          size={22}
          aria-label={failed ? '缩略图读取失败' : '没有可读缩略图'}
        />
      )}
    </div>
  );
}

export function ImageStatisticsDialog({
  imageId,
  client,
  identity,
  onClose,
  onSessionExpired,
  returnLabel = '返回来源',
  managementUrl,
  onManage,
}: {
  imageId: string;
  client: QueryClient;
  identity?: ImageStatisticsIdentity;
  onClose: () => void;
  onSessionExpired: () => void;
  returnLabel?: string;
  managementUrl?: string;
  onManage?: () => void;
}) {
  const [sessionEnded, setSessionEnded] = useState(false);
  const query = useImageAnalytics(client, imageId, !sessionEnded);
  const status =
    query.error instanceof AnalyticsReadError ? query.error.status : undefined;
  // Latch before the parent clears its client, so clearing cannot restart polling.
  if (status === 401 && !sessionEnded) setSessionEnded(true);
  useEffect(() => {
    if (sessionEnded) onSessionExpired();
  }, [sessionEnded, onSessionExpired]);
  if (sessionEnded) return null;
  const data =
    sessionEnded || status === 401 || status === 404 ? undefined : query.data;
  const retry = () => {
    void query.refetch();
  };
  const identityLabel = identity?.recycled
    ? '回收站'
    : identity?.visibility === 'private'
      ? '私有图片'
      : identity?.visibility === 'public'
        ? '公开图片'
        : undefined;
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="bg-[#16152545] backdrop-blur-[5px] motion-reduce:transition-none"
    >
      <Modal.Container
        placement="center"
        scroll="inside"
        className="w-full p-4 sm:w-full sm:p-4 md:p-6"
      >
        <Modal.Dialog
          aria-label="图片访问统计"
          data-testid="image-statistics-dialog"
          data-image-id={imageId}
          className="max-h-[calc(var(--visual-viewport-height,100dvh)-32px)] w-full max-w-[740px] gap-0 overflow-hidden rounded-[14px] border border-border bg-surface p-0 text-foreground shadow-[0_28px_90px_#16152529] md:max-h-[calc(var(--visual-viewport-height,100dvh)-48px)] motion-reduce:animate-none motion-reduce:transition-none"
        >
          <Modal.Header className="grid shrink-0 grid-cols-[minmax(0,1fr)_44px] items-center gap-2.5 border-b border-(--analytics-grid) px-4 py-[18px] md:grid-cols-[minmax(0,1fr)_auto_44px] md:gap-3.5 md:px-7 md:py-6">
            <div className="flex min-w-0 items-center gap-2.5 md:gap-4">
              <Thumbnail
                key={`${imageId}:${identity?.thumbnailUrl}`}
                src={identity?.thumbnailUrl}
              />
              <div className="min-w-0">
                <p className="mb-1 text-[10px] text-muted md:text-[11px]">
                  图片访问统计
                </p>
                <Modal.Heading
                  tabIndex={0}
                  data-testid="image-statistics-name"
                  className="max-h-[3em] overflow-y-auto overscroll-contain text-sm leading-normal font-medium wrap-anywhere outline-offset-2 md:text-lg"
                >
                  {identity?.displayName ?? `图片 · ${imageId.slice(0, 8)}`}
                </Modal.Heading>
                {identityLabel || identity?.format ? (
                  <p className="mt-[5px] flex flex-wrap items-center gap-[5px] text-[11px] text-muted">
                    {identityLabel ? (
                      <>
                        <span
                          aria-hidden
                          className="size-[5px] rounded-full bg-(--analytics-compressed)"
                        />
                        {identityLabel}
                      </>
                    ) : null}
                    {identityLabel && identity?.format ? (
                      <span className="mx-[3px]">·</span>
                    ) : null}
                    {identity?.format?.toUpperCase()}
                  </p>
                ) : null}
              </div>
            </div>
            {data ? (
              <div
                className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 md:col-span-1 md:block md:min-w-30 md:text-right"
                data-testid="image-statistics-total"
              >
                <div className="flex items-center md:justify-end">
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Eye aria-hidden size={15} />
                    累计访问
                  </span>
                  <ImageStatisticsTip label="累计访问口径">
                    <p>
                      累计包含原图、压缩图和水印图的公开内容请求，缩略图与所有者访问不计数；不是独立访客或完整下载人数。
                    </p>
                  </ImageStatisticsTip>
                </div>
                <strong className="flex items-baseline justify-end gap-1 text-[28px] leading-[1.1] font-medium tracking-[-0.04em] tabular-nums md:text-[32px]">
                  <RollingNumber value={data.cumulative.total} />
                  <small className="text-xs font-normal">次</small>
                </strong>
              </div>
            ) : null}
            <CloseButton
              aria-label="关闭图片统计"
              className="col-start-2 row-start-1 size-11 self-start rounded-lg bg-transparent text-muted hover:bg-transparent hover:text-foreground data-[hovered=true]:text-foreground active:transform-none data-[hovered=true]:bg-transparent data-[pressed=true]:transform-none md:col-start-3"
              onPress={onClose}
            />
          </Modal.Header>
          <Modal.Body className="m-0 grid min-h-0 gap-[22px] overflow-y-auto overscroll-contain px-4 pt-5 pb-2 md:gap-6 md:px-7 md:pt-6 md:pb-4">
            <ImageStatisticsContent
              data={data}
              error={query.error}
              pending={query.isPending}
              fetching={query.isFetching}
              onRetry={retry}
              onClose={onClose}
              returnLabel={returnLabel}
            />
          </Modal.Body>
          <Modal.Footer className="mt-0 flex min-h-15 shrink-0 flex-wrap items-center justify-between gap-x-2 border-t border-(--analytics-grid) px-4 py-2 md:px-7 md:py-3">
            <span
              className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted"
              data-testid="image-statistics-updated"
            >
              <Clock3 aria-hidden size={14} />
              {data
                ? `${query.isError ? '上次' : '更新于'} ${timestamp(data.generatedAt, data.timezone)}`
                : '尚未取得统计'}
              {data ? (
                <span className="hidden md:inline"> · {data.timezone}</span>
              ) : null}
              {query.isFetching && data ? (
                <span role="status"> · 更新中</span>
              ) : null}
            </span>
            <div className="flex items-center gap-1">
              {managementUrl &&
              status !== 404 &&
              status !== 401 &&
              !sessionEnded ? (
                <Link
                  href={managementUrl}
                  onPress={onManage}
                  className="flex min-h-11 items-center rounded-lg px-2 text-xs text-muted"
                >
                  查看记录
                </Link>
              ) : null}
              <ImageStatisticsTip label="统计说明">
                <p>
                  访问数字通常延迟一个写入周期，页面可见时每 10
                  秒读取；异常退出可能丢失尚未保存的访问。每日明细保留 365
                  天，更早数据只保留累计。
                </p>
                {data ? (
                  <>
                    <p>
                      {data.timezone} · 查询于{' '}
                      {timestamp(data.generatedAt, data.timezone)}。
                    </p>
                    <p>
                      {data.lastFlushedAt
                        ? `最近写入于 ${timestamp(data.lastFlushedAt, data.timezone)}。`
                        : '本进程尚无已提交的访问批次。'}
                      {data.approximate ? '统计为近似值。' : ''}
                    </p>
                  </>
                ) : null}
              </ImageStatisticsTip>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
