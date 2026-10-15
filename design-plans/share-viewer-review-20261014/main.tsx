import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { ArrowLeft } from 'lucide-react';
import {
  galleryMetrics,
  positionGalleryCards,
} from '../../src/components/gallery/layout';
import { ShareBrandHeading } from '../../src/components/sharing/brand';
import { PictureViewer } from './viewer';
import samples from './samples.json';

const layout =
  new URLSearchParams(location.search).get('layout') === 'grid'
    ? 'grid'
    : 'masonry';

function Prototype() {
  const gallery = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLElement | null>(null);
  const sourceScroll = useRef(0);
  const [size, setSize] = useState({ width: 0, viewport: innerWidth });
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    if (index < 0 && source.current) {
      source.current.focus({ preventScroll: true });
      window.scrollTo({ top: sourceScroll.current });
    }
  }, [index]);
  useLayoutEffect(() => {
    const element = gallery.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, viewport: innerWidth }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const metrics = galleryMetrics(size.width, size.viewport);
  const positions = positionGalleryCards(
    samples.map((photo) => {
      const height =
        metrics.cardWidth /
        (layout === 'grid' ? 4 / 3 : photo.width / photo.height);
      return { height, imageHeight: height };
    }),
    layout,
    metrics,
  );
  return (
    <>
      <div className="public-shell min-h-dvh">
        <div className="public-decoration" aria-hidden="true" />
        <header className="public-header z-10">
          <Link href="https://ariso.447654.xyz/" className="gap-1 text-sm">
            <ArrowLeft className="size-4" aria-hidden />
            返回首页
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-[1192px] flex-col px-4 min-[768px]:px-6 min-[1200px]:px-4">
          <div className="brand-area shrink-0 pt-[58px] pb-[21px] min-[768px]:pt-12">
            <ShareBrandHeading brand={{ name: 'Ariso', description: '' }} />
          </div>
          <section className="shrink-0">
            <div data-cover className="cover-height overflow-hidden rounded-xl">
              {/* Prototype photos use original source files, without changing their proportions. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={samples[0].src}
                alt="相册封面"
                className="size-full object-cover object-[center_44%]"
              />
            </div>
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 pt-5 pb-6 min-[768px]:pt-6">
              <h1 className="text-[28px] leading-9 font-medium tracking-[-0.025em] min-[1200px]:text-[32px] min-[1200px]:leading-10">
                精选壁纸
              </h1>
              <p className="text-muted text-[13px] leading-[22px] tabular-nums min-[768px]:text-sm">
                {samples.length} 张图片
              </p>
              <p className="text-muted col-span-2 text-sm leading-[22px]">
                收藏风景，也收藏片刻的安静。
              </p>
            </header>
          </section>
          <section data-gallery aria-label="相册图片" className="pb-8">
            <div
              ref={gallery}
              role="list"
              data-layout={layout}
              data-columns={metrics.columns}
              className="relative w-full"
              style={{ height: positions.height }}
            >
              {size.width > 0 &&
                samples.map((photo, i) => {
                  const slot = positions.slots[i];
                  return (
                    <div
                      role="listitem"
                      key={photo.src}
                      className="absolute overflow-hidden rounded-xl bg-default"
                      style={{
                        left: slot.left,
                        top: slot.top,
                        width: slot.width,
                        height: slot.height,
                      }}
                    >
                      <Button
                        data-photo={i}
                        aria-label={`查看第 ${i + 1} 张图片`}
                        variant="ghost"
                        className="size-full min-w-0 rounded-none p-0"
                        onPress={(event) => {
                          source.current = event.target as HTMLElement;
                          sourceScroll.current = window.scrollY;
                          setIndex(i);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.src}
                          width={photo.width}
                          height={photo.height}
                          alt={photo.alt}
                          draggable={false}
                          className={`size-full ${layout === 'grid' ? 'object-cover' : 'object-contain'}`}
                        />
                      </Button>
                    </div>
                  );
                })}
            </div>
          </section>
        </main>
      </div>
      <PictureViewer index={index} close={() => setIndex(-1)} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Prototype />);
