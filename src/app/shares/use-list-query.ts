'use client';

import { useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  readShareListQuery,
  shareListHref,
  type ShareListQuery,
} from './list-query';

/** Share type belongs to the same URL state as its existing search and page. */
export function useShareListQuery() {
  const params = useSearchParams();
  const replacedHref = useRef<string | null>(null);
  let query: ShareListQuery = { q: '', page: 1, pageSize: 40, kind: 'album' };
  let error: Error | null = null;
  try {
    query = readShareListQuery(new URLSearchParams(params.toString()));
  } catch (cause) {
    error = cause as Error;
  }
  function change(patch: Partial<ShareListQuery>) {
    const next = { ...query, ...patch };
    if (
      patch.q !== undefined ||
      patch.pageSize !== undefined ||
      patch.kind !== undefined
    )
      next.page = 1;
    const href = shareListHref(next);
    if (patch.q !== undefined && patch.kind === undefined) {
      const currentHref = shareListHref(query);
      replacedHref.current = href !== currentHref ? currentHref : null;
      window.history.replaceState(null, '', href);
    } else window.history.pushState(null, '', href);
  }
  return { ...query, href: shareListHref(query), error, change, replacedHref };
}
