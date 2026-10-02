'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

/** Native history keeps the mounted list, its loaded pages and scroll position. */
export function useDetailNavigation() {
  const params = useSearchParams();
  const imageId = params.get('image');
  const view =
    imageId &&
    ['versions', 'reprocess'].includes(params.get('detailView') ?? '')
      ? (params.get('detailView') as 'versions' | 'reprocess')
      : null;
  const listScroll = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  const openedFromList = useRef(false);

  function open(id: string, element: HTMLElement) {
    trigger.current = element;
    listScroll.current =
      document.getElementById('main-content')?.scrollTop ?? 0;
    openedFromList.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set('image', id);
    window.history.pushState(null, '', url);
  }

  function close() {
    requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = listScroll.current;
    });
    if (openedFromList.current) {
      openedFromList.current = false;
      window.history.back();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete('image');
      url.searchParams.delete('detailView');
      url.searchParams.delete('preview');
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

  function openView(value: 'versions' | 'reprocess', selected?: string) {
    const main = document.getElementById('main-content');
    if (!view) listScroll.current = main?.scrollTop ?? 0;
    const url = new URL(window.location.href);
    url.searchParams.set('detailView', value);
    if (selected) url.searchParams.set('preview', selected);
    window.history.replaceState(null, '', url);
    if (main) main.scrollTop = 0;
  }
  function returnToDetail() {
    const url = new URL(window.location.href);
    url.searchParams.delete('detailView');
    window.history.replaceState(null, '', url);
    requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = listScroll.current;
      document
        .querySelector<HTMLElement>('[data-testid="detail-version-entry"]')
        ?.focus();
    });
  }
  const previousView = useRef(view);
  useEffect(() => {
    const previous = previousView.current;
    previousView.current = view;
    if (view) {
      document
        .querySelector<HTMLElement>('[data-testid="detail-workspace-title"]')
        ?.focus();
    } else if (previous) {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = listScroll.current;
      const target = imageId
        ? document.querySelector<HTMLElement>(
            '[data-testid="detail-version-entry"]',
          )
        : trigger.current?.isConnected
          ? trigger.current
          : document.getElementById('library-title');
      target?.focus({ preventScroll: true });
    }
  }, [view, imageId]);
  return { imageId, view, open, close, dialogRef, openView, returnToDetail };
}
