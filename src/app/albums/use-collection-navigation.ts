'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  collectionListHref,
  collectionReturnIdentity,
  readCollectionQuery,
  type CollectionPath,
  type CollectionQuery,
} from './collection-navigation';

type ReturnPosition = { scrollTop: number; focusKey: string | null };
const returnKey = ['collection-return'] as const;

export function useCollectionQuery(path: CollectionPath) {
  const params = useSearchParams();
  const replacedHref = useRef<string | null>(null);
  let query: CollectionQuery = { q: '', page: 1, pageSize: 40 };
  let error: Error | null = null;
  try {
    query = readCollectionQuery(new URLSearchParams(params.toString()));
  } catch (cause) {
    error = cause as Error;
  }
  function change(patch: Partial<CollectionQuery>) {
    const next = { ...query, ...patch };
    if (patch.q !== undefined || patch.pageSize !== undefined) next.page = 1;
    const href = collectionListHref(path, next);
    // Search replaces the current entry; page changes remain available to Back.
    if (patch.q !== undefined) {
      const currentHref = collectionListHref(path, query);
      replacedHref.current = href !== currentHref ? currentHref : null;
      window.history.replaceState(null, '', href);
    } else window.history.pushState(null, '', href);
  }
  return {
    ...query,
    href: collectionListHref(path, query),
    error,
    change,
    replacedHref,
  };
}

/** Retain only navigation context, using the existing owner QueryClient. */
export function useCollectionReturn(
  sourceHref: string,
  ready: boolean,
  resetOnNew = true,
  replacedHrefRef?: { current: string | null },
) {
  const href = collectionReturnIdentity(sourceHref);
  const client = useQueryClient();
  const current = useRef<{ href: string; position: ReturnPosition } | null>(
    null,
  );
  const key = [...returnKey, href] as const;
  function remember(element?: HTMLElement | null) {
    const main = document.getElementById('main-content');
    if (!main) return;
    const previous =
      current.current?.href === href ? current.current.position : null;
    const target = element ?? (document.activeElement as HTMLElement | null);
    const focusKey =
      target?.dataset.collectionReturnFocus ?? previous?.focusKey ?? null;
    const position = previous ?? { scrollTop: 0, focusKey: null };
    position.scrollTop = main.scrollTop;
    position.focusKey = focusKey;
    current.current = { href, position };
    client.setQueryDefaults(returnKey, { gcTime: Infinity });
    client.setQueryData(key, position);
  }
  useEffect(() => {
    if (!ready) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    client.setQueryDefaults(returnKey, { gcTime: Infinity });
    const queryKey = [...returnKey, href] as const;
    if (replacedHrefRef) replacedHrefRef.current = null;
    const saved = client.getQueryData<ReturnPosition>(queryKey);
    // The mounted page owns this position again; keep cached positions only
    // for history entries that are currently away from the list.
    if (saved) client.removeQueries({ queryKey, exact: true });
    const position: ReturnPosition = saved
      ? { ...saved }
      : { scrollTop: 0, focusKey: null };
    current.current = { href, position };
    const saveScroll = () => {
      position.scrollTop = main.scrollTop;
    };
    const saveFocus = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.collectionReturnFocus)
        position.focusKey = target.dataset.collectionReturnFocus;
    };
    const frame = requestAnimationFrame(() => {
      if (saved || resetOnNew) main.scrollTo(0, position.scrollTop);
      if (saved) {
        const source = Array.from(
          main.querySelectorAll<HTMLElement>('[data-collection-return-focus]'),
        ).find(
          (element) =>
            element.dataset.collectionReturnFocus === position.focusKey &&
            element.getClientRects().length > 0,
        );
        (
          source ??
          main.querySelector<HTMLElement>('[data-collection-return-fallback]')
        )?.focus({ preventScroll: true });
      }
      // Observe after restoration so a late zero from the old page is not saved.
      main.addEventListener('scroll', saveScroll, { passive: true });
      main.addEventListener('focusin', saveFocus);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (replacedHrefRef?.current === href) {
        replacedHrefRef.current = null;
        client.removeQueries({ queryKey, exact: true });
      } else client.setQueryData(queryKey, { ...position });
      main.removeEventListener('scroll', saveScroll);
      main.removeEventListener('focusin', saveFocus);
      if (current.current?.position === position) current.current = null;
    };
  }, [client, href, ready, resetOnNew, replacedHrefRef]);
  return remember;
}
