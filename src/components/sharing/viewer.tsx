'use client';

import { useEffect, useRef, useState } from 'react';
import type { ZoomRef } from 'yet-another-react-lightbox';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import type { PublicShareNeighbors } from '../../server/sharing/public-types';
import { ShareBrandHeading, type ShareBrand } from './brand';
import { ShareViewerCarousel } from './viewer-carousel';

const actionClass = 'h-12 min-w-0 flex-1 rounded-lg px-2 text-sm font-normal';

export default function ShareViewer({
  viewer,
  brand,
  loading,
  error,
  refreshError,
  refreshing,
  onClose,
  onNavigate,
  onRetry,
  onCheck,
}: {
  viewer: PublicShareNeighbors;
  brand: ShareBrand;
  loading: boolean;
  error: string;
  refreshError: string;
  refreshing: boolean;
  onClose: () => void;
  onNavigate: (direction: 'previous' | 'next') => void;
  onRetry: () => void;
  onCheck: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const zoomRef = useRef<ZoomRef>(null);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [supportsFullscreen, setSupportsFullscreen] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const zoomed = zoom > 1;
  const current = viewer.current!;
  const contentFailed =
    !!current.previewUrl && failedUrl === current.previewUrl;
  const failed = !!error || contentFailed;
  useEffect(() => {
    const element = root.current!;
    setSupportsFullscreen(
      document.fullscreenEnabled && !!element.requestFullscreen,
    );
    const changed = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement === element)
        void document.exitFullscreen();
    };
  }, []);
  useEffect(() => {
    if (failed) root.current?.focus({ preventScroll: true });
  }, [failed]);
  useEffect(() => {
    if (document.activeElement === document.body)
      (fullscreenButton.current ?? root.current)?.focus({
        preventScroll: true,
      });
  }, [fullscreen, zoomed]);
  async function toggleFullscreen() {
    try {
      setFullscreenError('');
      if (document.fullscreenElement === root.current)
        await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch (cause) {
      console.error('分享大图全屏切换失败', cause);
      setFullscreenError('全屏未能开启，请重试。');
    }
  }
  function retry() {
    setFailedUrl(null);
    setRevision((value) => value + 1);
    onRetry();
  }
  return (
    <section
      ref={root}
      tabIndex={-1}
      data-testid="share-viewer"
      data-image-id={current.imageId}
      data-zoom={zoom}
      aria-label="大图查看"
      className={`pointer-events-none absolute inset-0 flex h-dvh flex-col outline-none ${fullscreen ? 'isolate bg-background' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (fullscreen) void toggleFullscreen();
          else onClose();
        }
        // YARL owns gestures and zoomed keyboard panning. Buttons and the page
        // heading can also switch images when the carousel itself is not focused.
        if (
          !event.target ||
          (event.target as HTMLElement).closest('.yarl__root')
        )
          return;
        if (
          zoom === 1 &&
          !loading &&
          ['ArrowLeft', 'ArrowRight'].includes(event.key)
        ) {
          event.preventDefault();
          onNavigate(event.key === 'ArrowLeft' ? 'previous' : 'next');
        }
      }}
    >
      {fullscreen ? <div className="public-decoration" aria-hidden /> : null}
      {failed ? (
        <div className="min-h-0 flex-1 overflow-auto px-4 pt-[76px] pb-8 min-[768px]:pt-[120px]">
          <div className="mx-auto grid w-full max-w-120 gap-7 [&>header]:mx-2 [&>header>p:nth-child(2)]:leading-[17px] min-[768px]:[&>header]:mx-0">
            <ShareBrandHeading brand={brand} description />
            <Card
              data-testid="share-viewer-error"
              className="pointer-events-auto gap-4 rounded-3xl border border-border bg-surface p-6 shadow-none"
            >
              <h1 className="text-[22px] leading-8 font-medium">
                图片加载失败
              </h1>
              <p className="text-sm leading-[22px]">
                {error || '无法加载这张图片。'}
              </p>
              <p className="text-sm leading-[22px]">请重试或返回相册。</p>
              <Button
                data-testid="share-viewer-close"
                variant="outline"
                className={`${actionClass} w-full flex-none`}
                onPress={onClose}
              >
                返回相册
              </Button>
              <Button
                className={`${actionClass} w-full flex-none`}
                isDisabled={loading}
                onPress={retry}
              >
                {loading ? <Spinner size="sm" /> : null}重新加载
              </Button>
            </Card>
          </div>
        </div>
      ) : (
        <>
          {!fullscreen ? (
            <div className="shrink-0 pt-[58px] pb-[21px] min-[768px]:pt-12">
              <ShareBrandHeading brand={brand} />
            </div>
          ) : null}
          <div
            className={`pointer-events-auto mx-auto min-h-0 w-full max-w-[1192px] flex-1 overflow-auto px-4 pb-8 ${fullscreen ? 'pt-4' : ''}`}
          >
            <div className="flex items-center gap-3 text-sm leading-[22px]">
              <p
                className={`min-w-0 flex-1 tabular-nums ${fullscreen || zoomed ? 'text-center' : ''}`}
                aria-live="polite"
              >
                {viewer.position ?? '…'} / {viewer.total}
                {zoomed && !fullscreen ? ' · 已放大' : null}
              </p>
              {supportsFullscreen && !fullscreen && !zoomed ? (
                <Button
                  ref={fullscreenButton}
                  data-testid="share-viewer-fullscreen"
                  variant="outline"
                  className="h-11 w-22 rounded-lg text-sm font-normal"
                  onPress={() => void toggleFullscreen()}
                >
                  全屏
                </Button>
              ) : null}
            </div>
            {viewer.showName ? (
              <p className="mt-4 text-base leading-[22px] font-medium break-words">
                {current.displayName}
              </p>
            ) : null}
            <div
              className={`mt-4 w-full ${fullscreen ? 'h-[calc(100dvh-160px)] min-h-40' : `h-[390px] min-[768px]:h-[min(690px,calc(100dvh-270px))] min-[768px]:min-h-40 ${zoomed ? '' : 'py-[15px]'}`}`}
            >
              <ShareViewerCarousel
                viewer={viewer}
                loading={loading}
                zoomRef={zoomRef}
                revision={revision}
                onNavigate={onNavigate}
                onFailure={setFailedUrl}
                onZoom={setZoom}
              />
            </div>
            {zoomed && !fullscreen ? (
              <p className="mt-4 text-sm leading-[22px]">可拖动查看图片。</p>
            ) : null}
            {loading ? (
              <div
                role="status"
                className="mt-4 flex items-center gap-3 text-sm leading-[22px] text-muted"
              >
                <Spinner size="sm" />
                <p>正在读取图片…</p>
              </div>
            ) : null}
            {refreshError || fullscreenError ? (
              <div
                role="status"
                className="mt-4 flex items-center gap-3 text-sm leading-[22px] text-muted"
              >
                <p>{fullscreenError || '状态检查失败，当前内容已保留。'}</p>
                <Button
                  variant="outline"
                  className="min-h-11 rounded-lg"
                  data-testid="share-viewer-check"
                  isDisabled={fullscreenError ? loading : refreshing}
                  onPress={
                    fullscreenError ? () => void toggleFullscreen() : onCheck
                  }
                >
                  {refreshing && !fullscreenError ? '检查中' : '重试'}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="pointer-events-auto mx-auto flex w-full max-w-[1192px] shrink-0 gap-3 bg-background px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            {fullscreen ? (
              <Button
                ref={fullscreenButton}
                data-testid="share-viewer-fullscreen"
                variant="outline"
                className={actionClass}
                onPress={() => void toggleFullscreen()}
              >
                退出全屏
              </Button>
            ) : (
              <>
                <Button
                  data-testid="share-viewer-close"
                  variant="outline"
                  className={actionClass}
                  onPress={onClose}
                >
                  关闭
                </Button>
                {viewer.previous && !zoomed ? (
                  <Button
                    data-testid="share-viewer-previous"
                    variant="outline"
                    className={actionClass}
                    isDisabled={loading}
                    onPress={() => onNavigate('previous')}
                  >
                    上一张
                  </Button>
                ) : null}
                {viewer.next && !zoomed ? (
                  <Button
                    data-testid="share-viewer-next"
                    variant="outline"
                    className={actionClass}
                    isDisabled={loading}
                    onPress={() => onNavigate('next')}
                  >
                    下一张
                  </Button>
                ) : null}
                <Button
                  data-testid="share-viewer-zoom"
                  variant="outline"
                  className={actionClass}
                  isDisabled={!current.previewUrl || loading}
                  onPress={() =>
                    zoom > 1
                      ? zoomRef.current?.changeZoom(1)
                      : zoomRef.current?.zoomIn()
                  }
                >
                  {zoomed ? '还原' : '放大'}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
