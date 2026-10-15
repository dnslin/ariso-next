'use client';

import { useEffect, useRef, useState } from 'react';
import { FocusScope } from 'react-aria/FocusScope';
import { usePreventScroll } from 'react-aria/usePreventScroll';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { PublicShareNeighbors } from '../../server/sharing/public-types';
import { ShareViewerCarousel } from './viewer-carousel';

const iconClass =
  'absolute z-10 min-w-0 rounded-none border-0 bg-transparent p-3 text-white/80 drop-shadow-[0_1px_3px_#0009] hover:bg-transparent hover:text-white';

export default function ShareViewer({
  viewer,
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
  loading: boolean;
  error: string;
  refreshError: string;
  refreshing: boolean;
  onClose: () => void;
  onNavigate: (direction: 'previous' | 'next') => void;
  onRetry: () => void;
  onCheck: () => void;
}) {
  usePreventScroll();
  const root = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const current = viewer.current!;
  const contentFailed =
    !!current.previewUrl && failedUrl === current.previewUrl;
  const failed = !!error || contentFailed;
  useEffect(() => {
    if (failed) root.current?.focus({ preventScroll: true });
  }, [failed]);
  function retry() {
    setFailedUrl(null);
    setRevision((value) => value + 1);
    onRetry();
  }
  return (
    <FocusScope contain>
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label="大图查看"
        tabIndex={-1}
        data-testid="share-viewer"
        data-image-id={current.imageId}
        data-zoom={zoom}
        className="fixed inset-0 z-50 flex h-dvh flex-col bg-[#0b0b0d] text-white outline-none"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
          // YARL owns gestures and zoomed keyboard panning. The surrounding
          // icon controls can switch images while the carousel is not focused.
          if ((event.target as HTMLElement).closest('.yarl__root')) return;
          if (
            !failed &&
            zoom === 1 &&
            !loading &&
            ['ArrowLeft', 'ArrowRight'].includes(event.key)
          ) {
            event.preventDefault();
            onNavigate(event.key === 'ArrowLeft' ? 'previous' : 'next');
          }
        }}
      >
        {failed ? (
          <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-4">
            <Card
              data-testid="share-viewer-error"
              className="w-full max-w-120 gap-4 rounded-3xl border border-border bg-surface p-6 text-foreground shadow-none"
            >
              <h1 className="text-[22px] leading-8 font-medium">
                图片加载失败
              </h1>
              <p className="text-sm leading-[22px]">
                {error || '无法加载这张图片。'}
              </p>
              <p className="text-sm leading-[22px]">请重试或返回相册。</p>
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg text-sm font-normal"
                onPress={onClose}
              >
                返回相册
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg text-sm font-normal"
                isDisabled={loading}
                onPress={retry}
              >
                {loading ? <Spinner size="sm" /> : null}重新加载
              </Button>
            </Card>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1">
              <ShareViewerCarousel
                viewer={viewer}
                loading={loading}
                revision={revision}
                onNavigate={onNavigate}
                onFailure={setFailedUrl}
                onZoom={setZoom}
              />
            </div>
            {viewer.previous ? (
              <Button
                data-testid="share-viewer-previous"
                aria-label="上一张"
                variant="ghost"
                className={`${iconClass} top-1/2 left-0 size-14 -translate-y-1/2 min-[768px]:left-4`}
                isDisabled={loading}
                onPress={() => onNavigate('previous')}
              >
                <ChevronLeft className="size-8" strokeWidth={1.6} aria-hidden />
              </Button>
            ) : null}
            {viewer.next ? (
              <Button
                data-testid="share-viewer-next"
                aria-label="下一张"
                variant="ghost"
                className={`${iconClass} top-1/2 right-0 size-14 -translate-y-1/2 min-[768px]:right-4`}
                isDisabled={loading}
                onPress={() => onNavigate('next')}
              >
                <ChevronRight
                  className="size-8"
                  strokeWidth={1.6}
                  aria-hidden
                />
              </Button>
            ) : null}
            {loading ? (
              <div
                role="status"
                className="absolute bottom-6 left-6 flex items-center gap-3 text-sm"
              >
                <Spinner size="sm" />
                <p>正在读取图片…</p>
              </div>
            ) : null}
            {refreshError ? (
              <div
                role="status"
                className="absolute right-4 bottom-4 left-4 flex items-center justify-center gap-3 rounded-lg bg-[#0b0b0d]/90 p-3 text-sm"
              >
                <p>状态检查失败，当前内容已保留。</p>
                <Button
                  variant="outline"
                  className="min-h-11 shrink-0 rounded-lg border-white/40 bg-transparent text-white"
                  data-testid="share-viewer-check"
                  isDisabled={refreshing}
                  onPress={onCheck}
                >
                  {refreshing ? '检查中' : '重试'}
                </Button>
              </div>
            ) : null}
          </>
        )}
        <Button
          data-testid="share-viewer-close"
          aria-label="关闭图片"
          variant="ghost"
          className={`${iconClass} top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))] size-12`}
          onPress={onClose}
        >
          <X className="size-6" strokeWidth={1.6} aria-hidden />
        </Button>
      </section>
    </FocusScope>
  );
}
