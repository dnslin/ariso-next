'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Launch = {
  ids: string[];
  token: string;
  initialView: 'edit' | 'templates' | 'batch';
};
const key = (token: string) => `ariso:image-edit-selection:${token}`;
export function useImageEditorNavigation() {
  const params = useSearchParams();
  const token = params.get('imageEdit');
  const previousToken = useRef(token);
  const [workspace, setWorkspace] = useState<Launch | null>(null);
  const [message, setMessage] = useState('');
  const origin = useRef<{
    target: HTMLElement | null;
    scroll: number;
    pushed: boolean;
  }>({ target: null, scroll: 0, pushed: false });
  const restorePosition = useCallback(() => {
    const saved = origin.current;
    requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = saved.scroll;
      requestAnimationFrame(() => {
        const target = saved.target?.isConnected
          ? saved.target
          : document.querySelector<HTMLElement>(
              '[data-testid="detail-more-entry"], [data-testid="library-toolbar"] input',
            );
        target?.focus({ preventScroll: true });
      });
    });
  }, []);
  useEffect(() => {
    const previous = previousToken.current;
    previousToken.current = token;
    if (previous !== token && workspace && workspace.token !== token) {
      setWorkspace(null);
      restorePosition();
    }
  }, [token, workspace, restorePosition]);
  function open(
    ids: string[],
    target: HTMLElement | null,
    initialView: 'edit' | 'templates' | 'batch' = ids.length > 1
      ? 'batch'
      : 'edit',
  ) {
    const launch = { ids: [...ids], token: crypto.randomUUID(), initialView };
    origin.current = {
      target,
      scroll: document.getElementById('main-content')?.scrollTop ?? 0,
      pushed: true,
    };
    try {
      sessionStorage.setItem(key(launch.token), JSON.stringify(launch));
    } catch (error) {
      setMessage(
        `浏览器无法保留这次选择，刷新后需重新选择：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const url = new URL(window.location.href);
    url.searchParams.set('imageEdit', launch.token);
    window.history.pushState(null, '', url);
    setWorkspace(launch);
    requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 0;
    });
  }
  function close() {
    if (origin.current.pushed) {
      origin.current.pushed = false;
      window.history.back();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete('imageEdit');
      window.history.replaceState(null, '', url);
    }
  }
  function restore() {
    const token = params.get('imageEdit');
    if (!token) return;
    try {
      const saved = sessionStorage.getItem(key(token));
      if (!saved) {
        setMessage('这次图片选择已不在浏览器会话中，请重新选择图片。');
        return;
      }
      const launch = JSON.parse(saved) as Launch;
      if (
        !Array.isArray(launch.ids) ||
        !['edit', 'templates', 'batch'].includes(launch.initialView)
      ) {
        setMessage('保存的选择无法恢复，请重新选择图片。');
        return;
      }
      origin.current = {
        target: null,
        scroll: document.getElementById('main-content')?.scrollTop ?? 0,
        pushed: false,
      };
      setWorkspace({ ...launch, token });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    workspace,
    open,
    close,
    restore,
    message,
    recoverable: !workspace && Boolean(params.get('imageEdit')),
  };
}
