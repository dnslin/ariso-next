'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { CloseButton } from '@heroui/react/close-button';
import { Skeleton } from '@heroui/react/skeleton';
import type { Album } from './api';

const titles = {
  ready: '封面',
  processing: '封面正在处理',
  failed: '封面处理失败',
  disabled: '封面存储已停用',
  missing: '封面加载失败',
  empty: '暂无公开图片',
};

export function AlbumCoverImage({
  cover,
  onError,
}: {
  cover: Pick<Album['cover'], 'displayName' | 'status' | 'thumbnailUrl'>;
  onError?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return cover.thumbnailUrl && !failed ? (
    <div className="relative size-full">
      {!loaded ? (
        <Skeleton aria-hidden className="absolute inset-0 size-full" />
      ) : null}
      {/* 使用已有 thumbnail delivery，保持实际权限和读取错误。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.thumbnailUrl}
        alt={cover.displayName ?? ''}
        className="size-full object-cover"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
      />
    </div>
  ) : (
    <p className="p-4 text-sm text-muted">
      {titles[failed ? 'missing' : cover.status]}
    </p>
  );
}

export function AlbumCoverSummary({
  album,
  onSetCover,
  onRefresh,
}: {
  album: Album;
  onSetCover: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const { cover } = album;
  const status = failed ? 'missing' : cover.status;
  const title = cover.temporaryFallback ? '临时使用自动封面' : titles[status];
  const label = cover.temporaryFallback
    ? '临时使用自动封面'
    : cover.mode === 'manual'
      ? '手动封面'
      : '自动封面';
  const message = cover.temporaryFallback
    ? '原手动封面暂不符合封面条件。恢复为公开且处于正常图库状态时，会恢复原选择；永久删除中的图片不能恢复。'
    : status === 'processing'
      ? `${cover.displayName} 尚未生成缩略图。处理完成后会显示此图。`
      : status === 'failed'
        ? `${cover.displayName} 处理失败。可在图片详情重试处理。`
        : status === 'disabled'
          ? `暂时无法读取 ${cover.displayName}。启用对应存储后恢复显示。`
          : status === 'missing'
            ? `${cover.displayName} 的缩略图无法读取。`
            : status === 'empty'
              ? '本相册没有符合条件的公开图片。'
              : '';
  async function retry() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onRefresh();
      setFailed(false);
      setAttempt((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : '封面读取失败，请重试');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        data-testid="album-cover-summary"
        data-cover-status={status}
        data-cover-image-id={cover.imageId ?? ''}
        className="min-h-11 w-fit max-w-full justify-start rounded-lg px-0 text-left text-[13px] font-normal text-muted whitespace-normal [overflow-wrap:anywhere]"
        onPress={() => setOpen(true)}
      >
        {label} · {status === 'ready' ? cover.displayName : titles[status]}
      </Button>
      <Modal isOpen={open} onOpenChange={setOpen}>
        <Modal.Backdrop>
          <Modal.Container placement="center" scroll="inside" className="p-4">
            <Modal.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-hidden rounded-xl border border-border bg-surface px-4 py-6 shadow-[0_16px_48px_rgba(38,36,66,0.16)] md:px-6">
              <Modal.Header className="flex min-h-12 shrink-0 flex-row items-center justify-between gap-2.5">
                <Modal.Heading className="text-xl font-medium leading-normal">
                  {title}
                </Modal.Heading>
                <CloseButton
                  aria-label="关闭"
                  className="size-11 shrink-0 rounded-lg border border-border bg-surface"
                  onPress={() => setOpen(false)}
                />
              </Modal.Header>
              <Modal.Body className="m-0 grid content-start gap-4 overflow-y-auto p-0 text-sm leading-normal text-muted [overflow-wrap:anywhere]">
                <p>
                  {album.name} · #{album.id.slice(0, 8)}
                </p>
                <div className="rounded-[10px] bg-default px-4 py-8">
                  {status === 'ready' ? (
                    <div className="h-30">
                      <AlbumCoverImage
                        key={`${cover.imageId}-${attempt}`}
                        cover={cover}
                        onError={() => setFailed(true)}
                      />
                    </div>
                  ) : (
                    <p className="text-base">{titles[status]}</p>
                  )}
                </div>
                {message ? <p>{message}</p> : null}
                {error ? <p role="alert">{error}</p> : null}
              </Modal.Body>
              <Modal.Footer className="mt-0 grid shrink-0 grid-cols-1 gap-4">
                {status === 'missing' ? (
                  <Button
                    variant="outline"
                    className="h-12 w-full rounded-lg font-normal"
                    isDisabled={pending}
                    onPress={() => void retry()}
                  >
                    {pending ? '正在读取…' : '重试加载'}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={() => {
                    setOpen(false);
                    onSetCover();
                  }}
                >
                  重新设置封面
                </Button>
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={() => setOpen(false)}
                >
                  返回相册
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
