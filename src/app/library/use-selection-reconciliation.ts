'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { subscribeLibraryChanges } from '../../components/library/library-changes';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { SelectedLibraryItem } from '../../server/library/selection-types';
import { libraryRequestParams } from './query-state';
import { LibraryReadError } from './use-library-query';
import type { LibrarySelection } from './use-library-selection';

/** Read only the explicit selection, yielding between bounded HTTP batches. */
export async function readSelection(
  ids: string[],
  filters: LibraryFilters,
  signal: AbortSignal,
): Promise<SelectedLibraryItem[]> {
  const items: SelectedLibraryItem[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch('/api/images/selection', {
        method: 'POST',
        signal,
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ids.slice(offset, offset + 200),
          query: libraryRequestParams(filters, {}).toString(),
        }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error('连接中断，无法核对已选图片，请检查网络后重试。', {
        cause: error,
      });
    }
    if (!response.ok) {
      const result = (await response.json()) as {
        message: string;
        code: string;
      };
      throw new LibraryReadError(result.message, response.status, result.code);
    }
    const result = (await response.json()) as { items: SelectedLibraryItem[] };
    items.push(...result.items);
  }
  return items;
}

export function useSelectionReconciliation({
  selection,
  identity,
  filters,
  dataUpdatedAt,
  onSessionExpired,
  onInvalid,
  enabled = true,
}: {
  selection: LibrarySelection;
  identity: string;
  filters: LibraryFilters | null;
  dataUpdatedAt: number;
  onSessionExpired: () => void;
  onInvalid: (ids: string[]) => void;
  enabled?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState({
    identity,
    pending: false,
    error: '',
    removedCount: 0,
  });
  const retry = () => setRevision((previous) => previous + 1);
  useEffect(() => subscribeLibraryChanges(retry), []);
  const start = useEffectEvent((signal: AbortSignal) => {
    const snapshot = new Map(selection.selected);
    setStatus({
      identity,
      pending: !!snapshot.size,
      error: '',
      removedCount: 0,
    });
    if (!filters || !snapshot.size) return;
    void readSelection([...snapshot.keys()], filters, signal)
      .then((items) => {
        if (signal.aborted) return;
        selection.reconcile(snapshot, items);
        const valid = new Set(items.map((item) => item.id));
        onInvalid([...snapshot.keys()].filter((id) => !valid.has(id)));
        setStatus({
          identity,
          pending: false,
          error: '',
          removedCount: snapshot.size - items.length,
        });
      })
      .catch((error: unknown) => {
        if (signal.aborted) return;
        if (error instanceof LibraryReadError && error.status === 401) {
          onSessionExpired();
          return;
        }
        setStatus({
          identity,
          pending: false,
          error: error instanceof Error ? error.message : String(error),
          removedCount: 0,
        });
      });
  });
  useEffect(() => {
    if (!dataUpdatedAt || !enabled) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the pending state of this cancellable membership read.
    start(controller.signal);
    return () => controller.abort();
  }, [identity, dataUpdatedAt, revision, enabled]);
  return {
    ...(status.identity === identity
      ? status
      : { pending: false, error: '', removedCount: 0 }),
    retry,
  };
}
