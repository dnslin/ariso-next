import Lightbox, {
  createModule,
  type ComponentProps,
  type Plugin,
} from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import { FocusScope } from 'react-aria/FocusScope';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import samples from './samples.json';

function ViewerFocus({ children }: ComponentProps) {
  return <FocusScope contain>{children}</FocusScope>;
}
const focusPlugin: Plugin = ({ addParent }) =>
  addParent('controller', createModule('prototype-focus', ViewerFocus));
const plugins = [Zoom, focusPlugin];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function PictureViewer({
  index,
  close,
}: {
  index: number;
  close: () => void;
}) {
  return (
    <Lightbox
      className="share-picture-viewer"
      open={index >= 0}
      index={Math.max(0, index)}
      close={close}
      slides={samples}
      plugins={plugins}
      carousel={{
        finite: true,
        padding: 0,
        spacing: 0,
        imageFit: 'contain',
        preload: 1,
      }}
      controller={{ aria: true, closeOnEscape: true }}
      toolbar={{ buttons: ['close'] }}
      zoom={{ scrollToZoom: true, maxZoomPixelRatio: 3 }}
      animation={{
        fade: reduced ? 0 : 160,
        swipe: reduced ? 0 : 200,
        navigation: reduced ? 0 : 180,
        zoom: reduced ? 0 : 200,
      }}
      styles={{ container: { backgroundColor: '#0b0b0d' } }}
      labels={{
        Previous: '上一张',
        Next: '下一张',
        Close: '关闭图片',
        Lightbox: '图片浏览',
        'Photo gallery': '相册图片',
        Carousel: '当前图片',
      }}
      render={{
        iconPrev: () => <ChevronLeft size={32} strokeWidth={1.6} />,
        iconNext: () => <ChevronRight size={32} strokeWidth={1.6} />,
        iconClose: () => <X size={24} strokeWidth={1.6} />,
        buttonZoom: () => null,
      }}
    />
  );
}
