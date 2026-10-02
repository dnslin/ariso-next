'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Lightbox, { type SlideImage } from 'yet-another-react-lightbox';
import Inline from 'yet-another-react-lightbox/plugins/inline';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import { Modal } from '@heroui/react/modal';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Tabs } from '@heroui/react/tabs';
import { Tooltip } from '@heroui/react/tooltip';
import { ImageOff, Maximize, Minimize } from 'lucide-react';
import type { LibraryDetail } from '../../server/library/detail-types';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { VersionKind } from '../../server/media/schema';
import { useImageViewer } from './use-image-viewer';
import { initialViewerVersion, viewerVersionReason } from './viewer-model';
import { bytesLabel, versionLabels } from './detail-labels';
import { ViewerLayoutContext, ViewerLayoutPlugin } from './viewer-layout';
import { ViewerImage } from './viewer-image';
import 'yet-another-react-lightbox/styles.css';

type ViewerSlide = SlideImage & { imageId: string; reason: string | null };
const plugins = [Inline, Fullscreen, ViewerLayoutPlugin, Zoom];

export default function ImageViewer(props: {
  initial: LibraryDetail;
  initialVersion: VersionKind;
  filters?: LibraryFilters;
  albumId?: string;
  onSessionExpired: () => void;
  onClose: () => void;
}) {
  const viewer = useImageViewer(props);
  const [zoom, setZoom] = useState<
    import('yet-another-react-lightbox').ZoomRef | null
  >(null);
  const [fullscreen, setFullscreen] = useState<
    import('yet-another-react-lightbox').FullscreenRef | null
  >(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const controller =
    useRef<import('yet-another-react-lightbox').ControllerRef>(null);
  const setController = useCallback(
    (value: import('yet-another-react-lightbox').ControllerRef | null) => {
      controller.current = value;
      if (value)
        requestAnimationFrame(() => {
          if (controller.current === value) value.focus();
        });
    },
    [],
  );
  const {
    current,
    selectedVersion,
    selected,
    previous,
    next,
    pendingDirection,
  } = viewer;
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
      return {
        imageId: id,
        src: reason ? '' : (version?.previewPath ?? ''),
        alt: detail?.displayName ?? '',
        width: version?.width ?? detail?.width ?? undefined,
        height: version?.height ?? detail?.height ?? undefined,
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
  const knownVersion = current.versions.find(
    (version) => version.kind === selectedVersion,
  );
  const error = viewer.navigationError;

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={false}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Modal.Container
        placement="center"
        scroll="inside"
        className="w-full p-0 sm:w-full sm:p-0"
      >
        <Modal.Dialog
          aria-label="大图查看"
          data-testid="image-viewer"
          data-image-id={current.id}
          data-version={selectedVersion}
          className="h-(--visual-viewport-height) max-h-full min-h-0 w-full max-w-none rounded-none bg-background p-0"
        >
          <ViewerLayoutContext.Provider
            value={{
              ratio: `${current.width ?? 4} / ${current.height ?? 3}`,
              zoomed: !!zoom && zoom.zoom > 1,
              header: (
                <>
                  <h1
                    title={current.displayName}
                    className="min-w-0 flex-1 truncate pt-1 text-lg leading-[22px] font-medium"
                  >
                    {current.displayName}
                  </h1>
                  {fullscreen && !fullscreen.disabled ? (
                    <Tooltip>
                      <Button
                        aria-label={fullscreen.fullscreen ? '退出全屏' : '全屏'}
                        variant="outline"
                        isIconOnly
                        className="size-11 shrink-0 rounded-lg"
                        onPress={() => {
                          if (fullscreen.fullscreen) fullscreen.exit();
                          else fullscreen.enter();
                        }}
                      >
                        {fullscreen.fullscreen ? (
                          <Minimize aria-hidden size={18} />
                        ) : (
                          <Maximize aria-hidden size={18} />
                        )}
                      </Button>
                      <Tooltip.Content>
                        {fullscreen.fullscreen ? '退出全屏' : '全屏'}
                      </Tooltip.Content>
                    </Tooltip>
                  ) : null}
                  <Button
                    aria-label="关闭大图"
                    variant="outline"
                    className="h-11 w-18 shrink-0 rounded-lg text-sm leading-[21px] font-normal xl:w-25"
                    onPress={props.onClose}
                  >
                    关闭
                  </Button>
                </>
              ),
              versions: (
                <Tabs
                  selectedKey={selectedVersion}
                  onSelectionChange={(kind) => {
                    viewer.selectVersion(kind as VersionKind);
                    setFailed(null);
                  }}
                  className="gap-0"
                >
                  <Tabs.ListContainer className="w-full rounded-none bg-transparent">
                    <Tabs.List
                      aria-label="大图查看版本"
                      className="grid w-full grid-cols-4 gap-1.5 rounded-none bg-transparent p-0"
                    >
                      {current.versions.map((version) => (
                        <Tabs.Tab
                          key={version.kind}
                          id={version.kind}
                          isDisabled={!!viewerVersionReason(current, version)}
                          className="h-11 min-w-0 rounded-lg border border-border bg-background px-1 text-sm leading-[21px] font-normal text-foreground data-[selected=true]:border-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                        >
                          {versionLabels[version.kind]}
                        </Tabs.Tab>
                      ))}
                    </Tabs.List>
                  </Tabs.ListContainer>
                </Tabs>
              ),
              information: (
                <>
                  <p data-testid="viewer-current-version">
                    {versionLabels[selectedVersion]}
                    {knownVersion?.saved
                      ? ` · ${knownVersion.format?.toLowerCase() === 'webp' ? 'WebP' : knownVersion.format?.toUpperCase()} · ${bytesLabel(knownVersion.byteSize ?? 0)}`
                      : ' · 未保存'}
                    {viewer.isPreview ? ' · 静态预览' : ''}
                  </p>
                  <p className="hidden text-xs leading-[22px] md:block">
                    滚轮缩放 · 拖动平移 · Esc 关闭
                  </p>
                  <p className="text-xs leading-[22px] md:hidden">
                    双指缩放，放大后拖动查看。
                  </p>
                  {current.versions
                    .filter((version) => viewerVersionReason(current, version))
                    .map((version) => (
                      <p key={version.kind} className="text-xs text-muted">
                        {versionLabels[version.kind]}：
                        {viewerVersionReason(current, version)}
                      </p>
                    ))}
                  {viewer.neighborsError ? (
                    <div
                      role="alert"
                      className="grid justify-items-start gap-2 text-sm"
                    >
                      <p>
                        浏览上下文需要刷新：{viewer.neighborsError.message}{' '}
                        已知相邻图片仍保留。
                      </p>
                      <Button
                        variant="outline"
                        className="min-h-11 rounded-lg"
                        onPress={() => {
                          void viewer.retryNeighbors();
                        }}
                      >
                        刷新浏览上下文
                      </Button>
                    </div>
                  ) : null}
                  {viewer.statusError ? (
                    <div
                      role="alert"
                      className="grid justify-items-start gap-2 text-sm"
                    >
                      <p>图片状态读取失败：{viewer.statusError.message}</p>
                      <Button
                        variant="outline"
                        className="min-h-11 rounded-lg"
                        onPress={retry}
                      >
                        刷新图片状态
                      </Button>
                    </div>
                  ) : null}
                  {pendingDirection ? (
                    <p role="status" className="text-sm">
                      正在读取
                      {pendingDirection === 'next' ? '下一张' : '上一张'}图片…
                    </p>
                  ) : null}
                </>
              ),
              footer: (
                <>
                  <Button
                    variant="outline"
                    className="h-12 w-full min-w-0 rounded-lg px-2 text-sm leading-[21px] font-normal"
                    isDisabled={!previous || !!pendingDirection}
                    onPress={() => {
                      controller.current?.focus();
                      void viewer.navigate('previous');
                    }}
                  >
                    {previous ? '上一张' : props.filters ? '第一张' : '上一张'}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 w-full min-w-0 rounded-lg px-2 text-sm leading-[21px] font-normal"
                    isDisabled={
                      !selected || readFailed || !zoom || zoom.disabled
                    }
                    onPress={() => {
                      if (zoom && zoom.zoom > 1) zoom.changeZoom(1);
                      else zoom?.zoomIn();
                    }}
                  >
                    {zoom && zoom.zoom > 1 ? '还原' : '放大'}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 w-full min-w-0 rounded-lg px-2 text-sm leading-[21px] font-normal"
                    isDisabled={!next || !!pendingDirection}
                    onPress={() => {
                      controller.current?.focus();
                      void viewer.navigate('next');
                    }}
                  >
                    {next ? '下一张' : props.filters ? '最后一张' : '下一张'}
                  </Button>
                </>
              ),
            }}
          >
            <Lightbox
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
                ref: setController,
                closeOnEscape: false,
                disableSwipeNavigation: !!pendingDirection,
                touchAction: 'none',
              }}
              toolbar={{ buttons: [] }}
              zoom={{ ref: setZoom, scrollToZoom: true, maxZoomPixelRatio: 3 }}
              fullscreen={{ ref: setFullscreen }}
              styles={{
                container: {
                  backgroundColor: 'var(--background)',
                  touchAction: 'none',
                },
              }}
              labels={{
                Lightbox: '大图查看',
                'Photo gallery': '当前图片与相邻图片',
                Carousel: '图片查看',
              }}
              render={{
                buttonPrev: () => null,
                buttonNext: () => null,
                buttonZoom: () => null,
                buttonFullscreen: () => null,
                slide: (slideProps) => {
                  const slide = slideProps.slide as ViewerSlide;
                  if (!slide.src)
                    return (
                      <div
                        data-testid="viewer-placeholder"
                        role="status"
                        className="grid size-full content-center justify-items-center gap-3 rounded-xl bg-surface p-4 text-center text-sm"
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
                      onError={() => {
                        if (
                          slide.imageId === current.id &&
                          slideProps.offset === 0
                        )
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
                      void viewer.navigate(
                        nextIndex < index ? 'previous' : 'next',
                      );
                  }
                },
              }}
            />
          </ViewerLayoutContext.Provider>
          {error ? (
            <AlertDialog.Backdrop
              isOpen
              UNSTABLE_portalContainer={document.fullscreenElement ?? undefined}
              isKeyboardDismissDisabled={false}
              onOpenChange={(open) => {
                if (!open) viewer.dismissNavigationError();
              }}
            >
              <AlertDialog.Container placement="center" className="p-4">
                <AlertDialog.Dialog
                  data-testid="viewer-navigation-error"
                  className="flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-none"
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
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
