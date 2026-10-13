'use client';

import { useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { useAnimate } from 'motion/react';
import { componentEntryTransition } from '../../components/motion';

export function LibraryCardEntrance({
  children,
  id,
  index,
  entered,
  loadedThumbnails,
  reduce,
}: {
  children: ReactNode;
  id: string;
  index: number;
  entered: RefObject<Set<string>>;
  loadedThumbnails: RefObject<Set<string>>;
  reduce: boolean;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  useLayoutEffect(() => {
    // Virtual scrolling remounts cards. Each image enters once per gallery visit.
    if (entered.current.has(id)) return;
    entered.current.add(id);
    const controls = animate(
      scope.current,
      {
        opacity: [0, 1],
        transform: reduce ? ['none', 'none'] : ['translateY(10px)', 'none'],
      },
      componentEntryTransition(reduce, reduce ? 0 : Math.min(index, 3) * 0.055),
    );
    return () => controls.complete();
  }, [animate, entered, id, index, reduce, scope]);
  return (
    <div
      ref={scope}
      data-library-entry
      className="library-component h-full"
      onLoadCapture={(event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement) || !image.naturalWidth) return;
        const url = image.currentSrc;
        if (loadedThumbnails.current.has(url)) return;
        loadedThumbnails.current.add(url);
        animate(
          image,
          { opacity: [0, 1] },
          componentEntryTransition(reduce).opacity,
        );
      }}
    >
      {children}
    </div>
  );
}
