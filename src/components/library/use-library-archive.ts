'use client';

import { useEffect, useRef, useState } from 'react';
import type { LibrarySelection } from '../../app/library/use-library-selection';
import type {
  ArchivePreparation,
  ArchiveVersion,
} from '../../server/library/archive-types';
import type { SelectedLibraryItem } from '../../server/library/selection-types';
import {
  ArchiveRequestError,
  requestArchivePreparation,
  startArchiveDownload,
} from './archive-request';

interface ArchiveWorkspace {
  items: SelectedLibraryItem[];
  currentCount: number;
  query: string;
  version: ArchiveVersion;
  excluded: string[];
  phase: 'checking' | 'ready' | 'started';
  result: ArchivePreparation | null;
  error: string | null;
}

export function useLibraryArchive({
  selection,
  query,
  onExpire,
}: {
  selection: LibrarySelection;
  query: string;
  onExpire: () => void;
}) {
  const [workspace, setWorkspace] = useState<ArchiveWorkspace | null>(null);
  const controller = useRef<AbortController | null>(null);
  const source = useRef<HTMLElement | null>(null);
  const scroll = useRef({ element: null as HTMLElement | null, top: 0 });
  useEffect(() => () => controller.current?.abort(), [query]);
  if (workspace && workspace.query !== query) setWorkspace(null);

  async function check(next: ArchiveWorkspace) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const ids = next.items
      .filter((item) => !next.excluded.includes(item.id))
      .map((item) => item.id);
    if (!ids.length || ids.length > 200) {
      setWorkspace({
        ...next,
        phase: 'ready',
        result: null,
        error: ids.length
          ? '单次最多打包 200 张图片，请关闭后调整选择。'
          : '本次下载没有图片，请改选版本或返回重新选图。',
      });
      return;
    }
    setWorkspace({ ...next, phase: 'checking', result: null, error: null });
    try {
      const result = await requestArchivePreparation(
        { ids, query: next.query, version: next.version },
        active.signal,
      );
      active.signal.throwIfAborted();
      setWorkspace({ ...next, result, phase: 'ready', error: null });
    } catch (error) {
      if (active.signal.aborted) return;
      if (error instanceof ArchiveRequestError && error.status === 401) {
        selection.clear();
        setWorkspace(null);
        onExpire();
        return;
      }
      setWorkspace({
        ...next,
        phase: 'ready',
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  function open(element: HTMLElement) {
    if (!selection.selected.size) return;
    source.current = element;
    element.focus({ preventScroll: true });
    const scroller = element.closest('main');
    scroll.current = { element: scroller, top: scroller?.scrollTop ?? 0 };
    void check({
      items: [...selection.selected.values()],
      currentCount: selection.currentCount,
      query,
      version: 'original',
      excluded: [],
      phase: 'checking',
      result: null,
      error: null,
    });
  }
  function close() {
    controller.current?.abort();
    setWorkspace(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (scroll.current.element)
          scroll.current.element.scrollTop = scroll.current.top;
        const target = source.current?.isConnected
          ? source.current
          : document.querySelector<HTMLButtonElement>(
              '[data-testid="library-selection"] button[aria-label]',
            );
        if (target?.isConnected) target.focus({ preventScroll: true });
        else
          document
            .getElementById('library-title')
            ?.focus({ preventScroll: true });
      }),
    );
  }
  return {
    workspace,
    pending: workspace?.phase === 'checking',
    open,
    close,
    recheck: () => {
      if (workspace) void check(workspace);
    },
    chooseVersion: (version: ArchiveVersion) => {
      if (workspace) void check({ ...workspace, version, excluded: [] });
    },
    excludeUnavailable: () => {
      if (workspace?.result)
        void check({
          ...workspace,
          excluded: [
            ...workspace.excluded,
            ...workspace.result.unavailable.map((item) => item.imageId),
          ],
        });
    },
    start: () => {
      if (!workspace?.result?.downloadUrl || !workspace.result.items.length)
        return;
      if (
        !workspace.result.expiresAt ||
        Date.parse(workspace.result.expiresAt) <= Date.now()
      ) {
        void check(workspace);
        return;
      }
      startArchiveDownload(workspace.result.downloadUrl);
      setWorkspace({ ...workspace, phase: 'started' });
    },
  };
}
export type LibraryArchive = ReturnType<typeof useLibraryArchive>;
