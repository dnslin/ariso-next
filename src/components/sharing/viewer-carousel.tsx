'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Lightbox, {
  useContainerRect,
  type ControllerRef,
  type SlideImage,
} from 'yet-another-react-lightbox';
import Inline from 'yet-another-react-lightbox/plugins/inline';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import type { ZoomRef } from 'yet-another-react-lightbox';
import { ImageOff } from 'lucide-react';
import type { PublicShareNeighbors } from '../../server/sharing/public-types';
import { ViewerImage } from '../library/viewer-image';
import 'yet-another-react-lightbox/styles.css';

const plugins = [Inline, Zoom];
type PublicSlide = SlideImage & { imageId: string; reason: string };
const unavailable = {
  processing: '图片正在处理',
  failed: '图片暂不可用',
  disabled: '存储已停用',
  missing: '图片暂不可用',
  ready: '没有可展示的图片版本',
};

export function ShareViewerCarousel({
  viewer,
  loading,
  zoomRef,
  revision,
  onNavigate,
  onFailure,
  onZoom,
}: {
  viewer: PublicShareNeighbors;
  loading: boolean;
  zoomRef: React.RefObject<ZoomRef | null>;
  revision: number;
  onNavigate: (direction: 'previous' | 'next') => void;
  onFailure: (url: string) => void;
  onZoom: (zoom: number) => void;
}) {
  const controller = useRef<ControllerRef>(null);
  const focused = useRef(false);
  const current = viewer.current!;
  useEffect(() => {
    if (!focused.current || document.activeElement === document.body)
      controller.current?.focus();
    focused.current = true;
  }, [current.imageId]);
  const { setContainerRef, containerRect } = useContainerRect();
  const [decoded, setDecoded] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const slides = useMemo(
    () =>
      [viewer.previous, current, viewer.next].flatMap((item): PublicSlide[] => {
        if (!item) return [];
        const dimensions = decoded[item.previewUrl ?? ''];
        const scale =
          dimensions && containerRect
            ? Math.max(
                1,
                Math.min(
                  containerRect.width / dimensions.width,
                  containerRect.height / dimensions.height,
                ),
              )
            : 1;
        return [
          {
            imageId: item.imageId,
            src: item.previewUrl ?? '',
            alt: viewer.showName ? (item.displayName ?? '图片') : '图片',
            width: dimensions ? dimensions.width * scale : undefined,
            height: dimensions ? dimensions.height * scale : undefined,
            reason: unavailable[item.status],
          },
        ];
      }),
    [
      viewer.previous,
      current,
      viewer.next,
      viewer.showName,
      decoded,
      containerRect,
    ],
  );
  const index = slides.findIndex((slide) => slide.imageId === current.imageId);

  return (
    <div
      ref={setContainerRef}
      data-testid="share-viewer-stage"
      className="relative size-full"
    >
      <Lightbox
        key={current.imageId}
        plugins={plugins}
        slides={slides}
        index={index}
        inline={{ className: 'size-full' }}
        carousel={{
          finite: true,
          preload: 1,
          padding: 0,
          spacing: 0,
          imageFit: 'contain',
        }}
        controller={{
          ref: controller,
          disableSwipeNavigation: loading,
          closeOnEscape: false,
        }}
        toolbar={{ buttons: [] }}
        zoom={{ ref: zoomRef, scrollToZoom: true, maxZoomPixelRatio: 3 }}
        animation={{ fade: 0, swipe: 0, navigation: 0, zoom: 0 }}
        styles={{
          container: { backgroundColor: 'transparent', touchAction: 'none' },
        }}
        labels={{
          Lightbox: '大图查看',
          'Photo gallery': '当前图片与公开相邻图片',
          Carousel: '图片查看',
        }}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
          buttonZoom: () => null,
          slide: (props) => {
            const slide = props.slide as PublicSlide;
            return slide.src ? (
              <ViewerImage
                key={`${slide.src}:${revision}`}
                {...props}
                onError={() => {
                  if (slide.imageId === current.imageId && props.offset === 0)
                    onFailure(slide.src);
                }}
                onDimensions={(width, height) => {
                  if (
                    decoded[slide.src]?.width === width &&
                    decoded[slide.src]?.height === height
                  )
                    return;
                  setDecoded((known) => ({
                    ...Object.fromEntries(
                      Object.entries(known).filter(([url]) =>
                        slides.some((item) => item.src === url),
                      ),
                    ),
                    [slide.src]: { width, height },
                  }));
                }}
              />
            ) : (
              <div
                role="status"
                className="grid size-full content-center justify-items-center gap-3 text-sm text-muted"
              >
                <ImageOff aria-hidden />
                <p>{slide.reason}</p>
              </div>
            );
          },
        }}
        on={{
          view: ({ index: nextIndex }) => {
            if (slides[nextIndex]?.imageId === current.imageId) return;
            if (nextIndex < index) controller.current?.next();
            else controller.current?.prev();
            if (!loading) onNavigate(nextIndex < index ? 'previous' : 'next');
          },
          zoom: ({ zoom }) => onZoom(zoom),
        }}
      />
    </div>
  );
}
