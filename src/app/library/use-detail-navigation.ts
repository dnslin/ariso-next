'use client';

import { useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

/** Native history keeps the mounted list, its loaded pages and scroll position. */
export function useDetailNavigation() {
  const params = useSearchParams();
  const imageId = params.get('image');
  const trigger = useRef<HTMLElement | null>(null);
  const openedFromList = useRef(false);

  function open(id: string, element: HTMLElement) {
    trigger.current = element;
    openedFromList.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set('image', id);
    window.history.pushState(null, '', url);
  }

  function close() {
    if (openedFromList.current) {
      openedFromList.current = false;
      window.history.back();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete('image');
      window.history.replaceState(null, '', url);
    }
  }

  const dialogRef = useCallback((node: HTMLElement | null) => {
    if (node) return;
    requestAnimationFrame(() => {
      const target = trigger.current?.isConnected
        ? trigger.current
        : document.getElementById('library-title');
      target?.focus({ preventScroll: true });
    });
  }, []);

  return { imageId, open, close, dialogRef };
}
