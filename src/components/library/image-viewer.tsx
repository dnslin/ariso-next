'use client';

import { useMemo, useRef, useState } from 'react';
import Lightbox, {
  createModule,
  useContainerRect,
  type ComponentProps,
  type Plugin,
  type SlideImage,
} from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import { FocusScope } from 'react-aria/FocusScope';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { ImageOff } from 'lucide-react';
import type { LibraryDetail } from '../../server/library/detail-types';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { VersionKind } from '../../server/media/schema';
import { useImageViewer } from './use-image-viewer';
import { initialViewerVersion, viewerVersionReason } from './viewer-model';
import { ViewerImage } from './viewer-image';
import 'yet-another-react-lightbox/styles.css';

type ViewerSlide = SlideImage & { imageId: string; reason: string | null };
function ViewerFocusScope({ children }: ComponentProps) {
  return <FocusScope contain>{children}</FocusScope>;
}
const containFocus: Plugin = ({ addParent }) => {
  addParent('controller', createModule('viewer-focus', ViewerFocusScope));
};
const plugins = [Zoom, containFocus];

export default function ImageViewer(props: {
  initial: LibraryDetail;
  initialVersion: VersionKind;
  filters?: LibraryFilters;
  albumId?: string;
  onSessionExpired: () => void;
  onClose: () => void;
}) {
  const viewer = useImageViewer(props);
  const { setContainerRef, containerRect } = useContainerRect();
  const [decodedDimensions, setDecodedDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [failed, setFailed] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const controller =
    useRef<import('yet-another-react-lightbox').ControllerRef>(null);
  const { current, selectedVersion, previous, next, pendingDirection } = viewer;
  const failureKey = `${current.id}:${selectedVersion}`;
  const readFailed = failed === failureKey;
  const previousId = previous?.id;
  const previousDetail = previous?.detail;
  const nextId = next?.id;
  const nextDetail = next?.detail;
  const slides = useMemo(() => {
    const slide = (
      detail: LibraryDetail | null,
      id: string,
      kind: VersionKind,
    ): ViewerSlide => {
      const version = detail?.versions.find((item) => item.kind === kind);
      const reason = detail
        ? viewerVersionReason(detail, version)
        : '正在读取相邻图片…';
      const dimensions =
        version?.width && version.height
          ? { width: version.width, height: version.height }
          : decodedDimensions[version?.previewPath ?? ''];
      const width = dimensions?.width;
      const height = dimensions?.height;
      // YARL caps images at the supplied size. Scale its display dimensions to
      // fill the viewport without cropping; source metadata stays in the detail.
      const scale =
        width && height && containerRect
          ? Math.max(
              1,
              Math.min(
                containerRect.width / width,
                containerRect.height / height,
              ),
            )
          : 1;
      return {
        imageId: id,
        src: reason ? '' : (version?.previewPath ?? ''),
        alt: detail?.displayName ?? '',
        width: width ? width * scale : undefined,
        height: height ? height * scale : undefined,
        reason,
      };
    };
    const active = slide(current, current.id, selectedVersion);
    if (viewer.unavailableReason || readFailed) {
      active.src = '';
      active.reason =
        viewer.unavailableReason ??
        '当前版本读取或解码失败，没有切换到其他版本。';
    }
    return [
      ...(previousId
        ? [
            slide(
              previousDetail ?? null,
              previousId,
              previousDetail
                ? initialViewerVersion(previousDetail)
                : 'original',
            ),
          ]
        : []),
      active,
      ...(nextId
        ? [
            slide(
              nextDetail ?? null,
              nextId,
              nextDetail ? initialViewerVersion(nextDetail) : 'original',
            ),
          ]
        : []),
    ];
  }, [
    containerRect,
    decodedDimensions,
    current,
    selectedVersion,
    previousDetail,
    previousId,
    nextDetail,
    nextId,
    viewer.unavailableReason,
    readFailed,
  ]);
  const index = slides.findIndex((slide) => slide.imageId === current.id);
  const retry = () => {
    setFailed(null);
    setRevision((value) => value + 1);
    viewer.refresh();
  };
  const error = viewer.navigationError;

  return (
    <>
      <Lightbox
        open
        close={props.onClose}
        portal={{
          container: {
            className: 'bg-background',
            ...{
              'data-testid': 'image-viewer',
              'data-image-id': current.id,
              'data-version': selectedVersion,
            },
          },
        }}
        slides={slides}
        index={index}
        plugins={plugins}
        carousel={{
          finite: true,
          preload: 1,
          padding: 0,
          spacing: 0,
          imageFit: 'contain',
        }}
        animation={{ fade: 0, swipe: 0, navigation: 0, zoom: 0 }}
        controller={{
          ref: controller,
          closeOnEscape: !error,
          disableSwipeNavigation: !!pendingDirection,
          touchAction: 'none',
        }}
        toolbar={{ buttons: ['close'] }}
        zoom={{ scrollToZoom: true, maxZoomPixelRatio: 3 }}
        styles={{
          root: { zIndex: 'var(--z-index-overlay)' },
          container: {
            backgroundColor: 'var(--background)',
            touchAction: 'none',
          },
        }}
        labels={{
          Lightbox: viewer.isPreview ? '大图查看（静态预览）' : '大图查看',
          'Photo gallery': '当前图片与相邻图片',
          Carousel: '图片查看',
        }}
        render={{
          buttonClose: () => (
            <CloseButton
              aria-label="关闭大图"
              className="fixed top-[max(16px,env(safe-area-inset-top))] right-[max(16px,env(safe-area-inset-right))] z-10 size-11 rounded-lg border border-border bg-background/90 text-foreground"
              onPress={() => controller.current?.close()}
            />
          ),
          controls: () => (
            <>
              <div
                ref={setContainerRef}
                data-testid="viewer-stage"
                className="pointer-events-none absolute inset-0"
              />
              {pendingDirection ? (
                <p role="status" className="sr-only">
                  正在读取{pendingDirection === 'next' ? '下一张' : '上一张'}
                  图片…
                </p>
              ) : null}
              {viewer.neighborsError || viewer.statusError ? (
                <div
                  role="alert"
                  className="absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] left-4 flex flex-wrap items-center justify-center gap-3 rounded-lg bg-surface p-3 text-sm"
                >
                  <p>
                    {viewer.statusError
                      ? `图片状态读取失败：${viewer.statusError.message}`
                      : `浏览上下文需要刷新：${viewer.neighborsError?.message}。已知相邻图片仍保留。`}
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-lg"
                    onPress={retry}
                  >
                    {viewer.statusError ? '刷新图片状态' : '刷新浏览上下文'}
                  </Button>
                </div>
              ) : null}
            </>
          ),
          buttonPrev: () => null,
          buttonNext: () => null,
          buttonZoom: () => null,
          slide: (slideProps) => {
            const slide = slideProps.slide as ViewerSlide;
            if (!slide.src)
              return (
                <div
                  data-testid="viewer-placeholder"
                  role="status"
                  className="grid size-full content-center justify-items-center gap-3 bg-surface p-4 text-center text-sm"
                >
                  <ImageOff aria-hidden />
                  <p>{slide.reason}</p>
                  {slide.imageId === current.id ? (
                    <Button
                      variant="outline"
                      className="min-h-11 rounded-lg"
                      onPress={retry}
                    >
                      重试读取
                    </Button>
                  ) : null}
                </div>
              );
            return (
              <ViewerImage
                key={`${slide.src}:${revision}`}
                {...slideProps}
                onDimensions={(width, height) => {
                  if (slide.width && slide.height) return;
                  setDecodedDimensions((known) => ({
                    ...Object.fromEntries(
                      Object.entries(known).filter(([src]) =>
                        slides.some((item) => item.src === src),
                      ),
                    ),
                    [slide.src]: { width, height },
                  }));
                }}
                onError={() => {
                  if (slide.imageId === current.id && slideProps.offset === 0)
                    setFailed(failureKey);
                }}
              />
            );
          },
        }}
        on={{
          view: ({ index: nextIndex }) => {
            if (slides[nextIndex]?.imageId !== current.id) {
              // Keep the visible ID until the hook verifies the target bytes.
              if (nextIndex < index) controller.current?.next();
              else controller.current?.prev();
              if (!pendingDirection)
                void viewer.navigate(nextIndex < index ? 'previous' : 'next');
            }
          },
        }}
      />
      {error ? (
        <AlertDialog.Backdrop
          isOpen
          isKeyboardDismissDisabled={false}
          onOpenChange={(open) => {
            if (!open) viewer.dismissNavigationError();
          }}
        >
          <AlertDialog.Container placement="center" className="p-4">
            <AlertDialog.Dialog
              data-testid="viewer-navigation-error"
              className="flex max-h-[calc(100dvh-32px)] w-full max-w-120 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-none"
            >
              <AlertDialog.Header>
                <AlertDialog.Heading className="text-xl leading-[30px] font-medium">
                  {error.direction === 'next' ? '下一张' : '上一张'}
                  图片读取失败
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="m-0 grid min-h-0 gap-4 overflow-y-auto p-0 text-sm leading-[21px] text-foreground">
                <p>没有切换到其他版本或图片。</p>
                <div className="rounded-lg bg-default p-3 text-[13px] leading-[19.5px]">
                  <p>当前图片仍保留，可以返回后继续查看。</p>
                  <p>不会因读取失败自动改用缩略图。</p>
                </div>
                <p className="text-xs text-muted">{error.message}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="mt-0 grid shrink-0 grid-cols-1 gap-4">
                <Button
                  autoFocus
                  variant="outline"
                  className="h-12 w-full rounded-lg text-sm leading-[21px] font-normal"
                  onPress={() => {
                    viewer.dismissNavigationError();
                    controller.current?.focus();
                  }}
                >
                  返回当前图片
                </Button>
                <Button
                  className="h-12 w-full rounded-lg text-sm leading-[21px] font-normal"
                  onPress={props.onClose}
                >
                  关闭大图
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      ) : null}
    </>
  );
}
