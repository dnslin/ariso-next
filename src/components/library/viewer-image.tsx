'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageSlide, type RenderSlideProps } from 'yet-another-react-lightbox';
import { Skeleton } from '@heroui/react/skeleton';

export function ViewerImage({
  onError,
  onDimensions,
  ...props
}: RenderSlideProps & {
  onError: () => void;
  onDimensions: (width: number, height: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fail = () => {
    if (!mounted.current) return;
    setFailed(true);
    onError();
  };
  return (
    <div className="relative flex size-full items-center justify-center">
      {!loaded && !failed ? (
        <Skeleton
          aria-label="正在加载图片"
          className="absolute inset-0 size-full"
        />
      ) : null}
      <ImageSlide
        {...props}
        imageProps={{
          draggable: false,
          style: {
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
          },
        }}
        render={{ iconLoading: () => null, iconError: () => null }}
        onLoad={async (image) => {
          try {
            await image.decode();
            if (mounted.current) {
              onDimensions(image.naturalWidth, image.naturalHeight);
              setLoaded(true);
            }
          } catch {
            fail();
          }
        }}
        onError={fail}
      />
    </div>
  );
}
