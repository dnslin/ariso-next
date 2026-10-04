'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { toast } from '@heroui/react/toast';
import { CircleCheck } from 'lucide-react';
import type { LibrarySelection } from '../../app/library/use-library-selection';
import type {
  LibraryCopyFormat,
  LibraryCopyResponse,
  LibraryCopyVersion,
} from '../../server/library/copy-types';
import { CopyRequestError, requestCopy, writeCopyText } from './copy-request';

interface CopyWorkspace {
  ids: string[];
  currentCount: number;
  query: string;
  version: LibraryCopyVersion;
  format: LibraryCopyFormat;
  phase: 'choose' | 'feedback' | 'manual';
  result: (LibraryCopyResponse & { text: string }) | null;
  copied: boolean;
  error: string | null;
}

export function useLibraryCopy({
  selection,
  query,
  onExpire,
}: {
  selection: LibrarySelection;
  query: string;
  onExpire: () => void;
}) {
  const [workspace, setWorkspace] = useState<CopyWorkspace | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const source = useRef<HTMLElement | null>(null);
  const scroll = useRef({ element: null as HTMLElement | null, top: 0 });
  useEffect(() => () => controller.current?.abort(), [query]);
  if (workspace && workspace.query !== query) {
    setWorkspace(null);
    setPending(false);
  }
  function open(element: HTMLElement) {
    if (busy.current || !selection.selected.size) return;
    const ids = [...selection.selected.keys()];
    source.current = element;
    // The menu item is removed on action; let Modal capture the surviving source.
    element.focus({ preventScroll: true });
    const scroller = element.closest('main');
    scroll.current = { element: scroller, top: scroller?.scrollTop ?? 0 };
    setWorkspace({
      ids,
      currentCount: selection.currentCount,
      query,
      version: 'default',
      format: 'url',
      phase: 'choose',
      result: null,
      copied: false,
      error: null,
    });
  }
  function close() {
    if (busy.current) return;
    setWorkspace(null);
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
      });
    });
  }
  async function copy() {
    if (!workspace || busy.current) return;
    busy.current = true;
    setPending(true);
    const active = new AbortController();
    controller.current = active;
    setWorkspace(
      (previous) => previous && { ...previous, result: null, error: null },
    );
    try {
      const result = await requestCopy(
        {
          ids: workspace.ids,
          query: workspace.query,
          version: workspace.version,
          format: workspace.format,
        },
        active.signal,
      );
      active.signal.throwIfAborted();
      const outcome = await writeCopyText(result.text);
      if (active.signal.aborted) return;
      if (outcome === 'copied' && !result.unavailable.length) {
        busy.current = false;
        close();
        const restricted = result.items.filter(
          (item) => item.accessWarning,
        ).length;
        const originalDisclosure = result.items.some(
          (item) => item.originalDisclosure,
        );
        toast(`已复制 ${result.items.length} 条链接`, {
          variant: 'default',
          indicator: createElement(CircleCheck, {
            size: 20,
            'aria-hidden': true,
          }),
          description:
            [
              restricted ? `${restricted} 条链接仅供所有者登录后访问。` : '',
              originalDisclosure ? '公开原图可能包含 GPS 和拍摄信息。' : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined,
        });
        return;
      }
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            result,
            phase: outcome === 'manual' ? 'manual' : 'feedback',
            copied: outcome === 'copied',
          },
      );
    } catch (error) {
      if (active.signal.aborted) return;
      if (error instanceof CopyRequestError && error.status === 401) {
        selection.clear();
        setWorkspace(null);
        onExpire();
        return;
      }
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            error: error instanceof Error ? error.message : String(error),
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
    manual: workspace?.phase === 'manual',
    open,
    close,
    copy,
    chooseVersion: (version: LibraryCopyVersion) =>
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            version,
            phase: 'choose',
            result: null,
            error: null,
          },
      ),
    chooseFormat: (format: LibraryCopyFormat) =>
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            format,
            phase: 'choose',
            result: null,
            error: null,
          },
      ),
  };
}
export type LibraryCopy = ReturnType<typeof useLibraryCopy>;
