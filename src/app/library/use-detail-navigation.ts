'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function availableForFocus(element: Element) {
  return (
    element.isConnected &&
    element.getClientRects().length > 0 &&
    !element.matches(':disabled,[aria-disabled="true"]') &&
    !element.closest(
      '[inert],[hidden],[aria-hidden="true"],[aria-disabled="true"]',
    )
  );
}

/** Native history keeps the mounted list, its loaded pages and scroll position. */
export function useDetailNavigation(
  fallbackFocus = '[data-testid="library-toolbar"] input',
) {
  const params = useSearchParams();
  const imageId = params.get('image');
  const view =
    imageId &&
    ['versions', 'reprocess'].includes(params.get('detailView') ?? '')
      ? (params.get('detailView') as 'versions' | 'reprocess')
      : null;
  const listScroll = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  const sourceImageId = useRef<string | null>(null);
  const pendingFocus = useRef(false);
  const focusReady = useRef(true);
  const focusFrame = useRef<number | null>(null);
  const openedFromList = useRef(false);
  const [contextImageId, setContextImageId] = useState<string | null>(null);

  function open(id: string, element: HTMLElement) {
    pendingFocus.current = false;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
    trigger.current = element;
    sourceImageId.current = id;
    listScroll.current =
      document.getElementById('main-content')?.scrollTop ?? 0;
    openedFromList.current = true;
    setContextImageId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('image', id);
    window.history.pushState(null, '', url);
  }

  function close() {
    pendingFocus.current = true;
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

  const restoreCloseFocus = useCallback(() => {
    if (
      !pendingFocus.current ||
      !focusReady.current ||
      focusFrame.current !== null
    )
      return;
    if (new URL(window.location.href).searchParams.has('image')) return;
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (!pendingFocus.current || !focusReady.current) return;
      if (new URL(window.location.href).searchParams.has('image')) return;
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active !== document.documentElement &&
        availableForFocus(active)
      ) {
        pendingFocus.current = false;
        return;
      }
      const current = sourceImageId.current
        ? document.querySelector<HTMLElement>(
            `[data-image-id="${sourceImageId.current}"] [data-library-open]`,
          )
        : null;
      const original = trigger.current;
      const originalImageId = original
        ?.closest('[data-image-id]')
        ?.getAttribute('data-image-id');
      const target =
        current ??
        (original?.isConnected &&
        (!originalImageId || originalImageId === sourceImageId.current)
          ? original
          : null) ??
        document.querySelector<HTMLElement>(fallbackFocus);
      // A present source may be disabled while its list refreshes. Keep the
      // one close intent until the consumer reports that the list is ready.
      if (!target || !availableForFocus(target)) return;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) pendingFocus.current = false;
    });
  }, [fallbackFocus]);

  const resumeCloseFocus = useCallback(
    (ready: boolean) => {
      focusReady.current = ready;
      if (!ready && focusFrame.current !== null) {
        cancelAnimationFrame(focusFrame.current);
        focusFrame.current = null;
      }
      if (ready) restoreCloseFocus();
    },
    [restoreCloseFocus],
  );
  const dialogRef = useCallback(
    (node: HTMLElement | null) => {
      if (node || new URL(window.location.href).searchParams.has('image'))
        return;
      pendingFocus.current = true;
      restoreCloseFocus();
    },
    [restoreCloseFocus],
  );
  useEffect(
    () => () => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    },
    [],
  );

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
      if (imageId)
        document
          .querySelector<HTMLElement>('[data-testid="detail-version-entry"]')
          ?.focus({ preventScroll: true });
      else {
        pendingFocus.current = true;
        restoreCloseFocus();
      }
    }
  }, [view, imageId, restoreCloseFocus]);
  return {
    imageId,
    view,
    open,
    close,
    dialogRef,
    openView,
    returnToDetail,
    resumeCloseFocus,
    hasListContext: imageId !== null && contextImageId === imageId,
  };
}
