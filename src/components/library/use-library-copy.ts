'use client';

import { useEffect, useRef, useState } from 'react';
import type { LibrarySelection } from '../../app/library/use-library-selection';
import type {
  LibraryCopyFormat,
  LibraryCopyResponse,
  LibraryCopyVersion,
} from '../../server/library/copy-types';
import type { SelectedLibraryItem } from '../../server/library/selection-types';
import { CopyRequestError, requestCopy, writeCopyText } from './copy-request';
import { captureCopyPreview } from './copy-preview';

interface CopyWorkspace {
  items: SelectedLibraryItem[];
  currentCount: number;
  query: string;
  version: LibraryCopyVersion;
  format: LibraryCopyFormat;
  phase: 'choose' | 'result' | 'empty';
  result: (LibraryCopyResponse & { text: string }) | null;
  copied: boolean;
  error: string | null;
  preview: ReturnType<typeof captureCopyPreview>;
}

export function useLibraryCopy({
  selection,
  query,
  onExpire,
  onReturnToSelection,
  album,
}: {
  selection: LibrarySelection;
  query: string;
  onExpire: () => void;
  onReturnToSelection: () => void;
  album: boolean;
}) {
  const [workspace, setWorkspace] = useState<CopyWorkspace | null>(null);
  const [pending, setPending] = useState(false);
  const [manual, setManual] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const source = useRef<HTMLElement | null>(null);
  const scroll = useRef({ element: null as HTMLElement | null, top: 0 });
  useEffect(() => () => controller.current?.abort(), [query]);
  if (workspace && workspace.query !== query) {
    setWorkspace(null);
    setManual(false);
    setPending(false);
  }
  function open(element: HTMLElement) {
    if (busy.current || !selection.selected.size) return;
    const items = [...selection.selected.values()].map((item) => ({
      ...item,
      storage: { ...item.storage },
    }));
    source.current = element;
    // The menu item is removed on action; let Modal capture the surviving source.
    element.focus({ preventScroll: true });
    const scroller = element.closest('main');
    scroll.current = { element: scroller, top: scroller?.scrollTop ?? 0 };
    setManual(false);
    setWorkspace({
      items,
      currentCount: selection.currentCount,
      query,
      version: 'default',
      format: 'url',
      phase: 'choose',
      result: null,
      copied: false,
      error: null,
      preview: captureCopyPreview(items),
    });
  }
  function close(returnToSelection = false) {
    if (busy.current) return;
    setWorkspace(null);
    setManual(false);
    requestAnimationFrame(() => {
      // React Aria restores overlay focus on the first animation frame.
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
        if (returnToSelection) onReturnToSelection();
      });
    });
  }
  async function copy(format: LibraryCopyFormat) {
    if (!workspace || busy.current) return;
    busy.current = true;
    setPending(true);
    const active = new AbortController();
    controller.current = active;
    setWorkspace(
      (previous) => previous && { ...previous, format, error: null },
    );
    try {
      const result = await requestCopy(
        {
          ids: workspace.items.map((item) => item.id),
          query: workspace.query,
          version: workspace.version,
          format,
        },
        active.signal,
      );
      active.signal.throwIfAborted();
      const outcome = await writeCopyText(result.text);
      if (active.signal.aborted) return;
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            result,
            phase: outcome === 'empty' ? 'empty' : 'result',
            copied: outcome === 'copied',
          },
      );
      setManual(outcome === 'manual');
    } catch (error) {
      if (active.signal.aborted) return;
      if (error instanceof CopyRequestError && error.status === 401) {
        selection.clear();
        setWorkspace(null);
        setManual(false);
        onExpire();
        return;
      }
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            error: `链接生成失败：${error instanceof Error ? error.message : String(error)}。已保留选择和复制模式，请重试。`,
          },
      );
    } finally {
      busy.current = false;
      if (!active.signal.aborted) setPending(false);
    }
  }
  return {
    workspace,
    pending,
    manual,
    contentVisible: workspace?.phase === 'result',
    returnLabel: album ? '返回相册内容' : '返回图库',
    open,
    close,
    copy,
    returnToSelection: () => close(true),
    closeManual: () => {
      setManual(false);
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document
            .getElementById('library-copy-title')
            ?.focus({ preventScroll: true }),
        ),
      );
    },
    chooseVersion: (version: LibraryCopyVersion) =>
      setWorkspace(
        (previous) => previous && { ...previous, version, error: null },
      ),
    chooseAgain: () => {
      setWorkspace(
        (previous) => previous && { ...previous, phase: 'choose', error: null },
      );
      requestAnimationFrame(() => {
        if (scroll.current.element)
          scroll.current.element.scrollTop = scroll.current.top;
      });
    },
  };
}
export type LibraryCopy = ReturnType<typeof useLibraryCopy>;
