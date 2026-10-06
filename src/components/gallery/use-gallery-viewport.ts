'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

export function useGalleryViewport(
  container: RefObject<HTMLElement | null>,
  scrollRootSelector: string,
  observeParent = false,
) {
  const [viewport, setViewport] = useState({
    width: 0,
    windowWidth: 0,
    top: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const element = container.current!;
    const scroller = element.closest<HTMLElement>(scrollRootSelector)!;
    let frame = 0;
    function measure() {
      const rect = element.getBoundingClientRect();
      if (!rect.width) return;
      setViewport({
        width: rect.width,
        windowWidth: window.innerWidth,
        top: scroller.getBoundingClientRect().top - rect.top,
        height: scroller.clientHeight,
      });
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    if (observeParent) observer.observe(element.parentElement!);
    observer.observe(scroller);
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [container, scrollRootSelector, observeParent]);

  return viewport;
}
