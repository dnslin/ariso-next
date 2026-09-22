'use client';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@heroui/react/button';
import { useState } from 'react';
import type { RecordItem } from './records';
import 'yet-another-react-lightbox/styles.css';

export default function Viewer({
  items,
  imageId,
  close,
  view,
  exited,
}: {
  items: RecordItem[];
  imageId: string | null;
  close: () => void;
  view: (id: string) => void;
  exited: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [zoom, setZoom] = useState(1);
  return (
    <Lightbox
      open={imageId !== null}
      close={close}
      index={Math.max(
        0,
        items.findIndex((item) => item.id === imageId),
      )}
      // Rebuilding this array intentionally exercises controlled identity on rerender.
      slides={items.map((item) => ({
        src: item.src,
        alt: item.name,
        width: 1600,
        height: 1200,
      }))}
      plugins={[Zoom, Fullscreen]}
      carousel={{ finite: true, preload: 1 }}
      controller={{ aria: true }}
      animation={{ fade: 0, swipe: 0, zoom: 0 }}
      zoom={{ maxZoomPixelRatio: 2 }}
      labels={{
        Close: '关闭查看器',
        Next: '下一张',
        Previous: '上一张',
        'Zoom in': '放大',
        'Zoom out': '缩小',
        'Enter Fullscreen': '进入全屏',
        'Exit Fullscreen': '退出全屏',
      }}
      toolbar={{
        buttons: [
          <Button
            key="rebuild"
            id="rebuild-slides"
            onPress={() => setRevision((value) => value + 1)}
          >
            重建窗口 {revision}
          </Button>,
          'close',
        ],
      }}
      render={{
        iconPrev: () => <ChevronLeft />,
        iconNext: () => <ChevronRight />,
        iconClose: () => <X />,
        iconZoomIn: () => <ZoomIn />,
        iconZoomOut: () => <ZoomOut />,
        iconEnterFullscreen: () => <Maximize />,
        iconExitFullscreen: () => <Minimize />,
        slideFooter: ({ slide }) => (
          <p
            className="absolute bottom-4 left-4 bg-black p-2 text-white"
            data-viewer-image={slide.alt}
          >
            缩放 <span data-zoom>{zoom}</span> · {slide.alt}
          </p>
        ),
      }}
      on={{
        view: ({ index }) => {
          if (items[index]) view(items[index].id);
        },
        zoom: ({ zoom }) => setZoom(zoom),
        exited,
      }}
    />
  );
}
