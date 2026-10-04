'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { LibrarySelection } from '../../app/library/use-library-selection';
import type {
  BatchItemResult,
  CleanupCommand,
} from '../../server/library/batch-types';
import { BatchRequestError, requestBatch } from './batch-request';
import { notifyLibraryChanged } from './library-changes';
import {
  cleanupCommandFor,
  recordCleanupResults,
  retryCleanupRow,
  type TrashBatchWorkspace,
} from './trash-batch-state';

const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function useTrashBatch({
  selection,
  query,
  onExpire,
  onRefresh,
}: {
  selection: LibrarySelection;
  query: string;
  onExpire: () => void;
  onRefresh: (
    results: BatchItemResult[],
    command: CleanupCommand,
  ) => Promise<unknown>;
}) {
  const [workspace, setWorkspace] = useState<TrashBatchWorkspace | null>(null);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [progressAttempt, setProgressAttempt] = useState(0);
  const [refreshError, setRefreshError] = useState('');
  const [refreshPending, setRefreshPending] = useState(false);
  const refreshRequest = useRef<{
    results: BatchItemResult[];
    command: CleanupCommand;
  } | null>(null);
  const source = useRef<HTMLElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const session = useRef<object | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      session.current = null;
    },
    [],
  );

  const unknownIds =
    workspace?.rows
      .filter((row) => row.state === 'unknown')
      .map((row) => row.id) ?? [];
  const unsentIds =
    workspace?.rows
      .filter((row) => row.state === 'unsent')
      .map((row) => row.id) ?? [];
  const failedIds =
    workspace?.rows
      .filter(
        (row) =>
          row.state === 'rejected' &&
          row.result.inQuery &&
          selection.selected.has(row.id),
      )
      .map((row) => row.id) ?? [];
  const failedTaskIds =
    workspace?.rows
      .filter(
        (row) =>
          row.state === 'task' &&
          row.result.cleanup.status === 'failed' &&
          row.result.inQuery,
      )
      .map((row) => row.id) ?? [];
  function open(element: HTMLElement) {
    if (inFlight.current) return;
    source.current = element;
    // Unsent and accepted work belongs to this frozen snapshot until explicitly left.
    if (
      workspace?.phase === 'result' &&
      (unknownIds.length || unsentIds.length || !selection.selected.size)
    ) {
      setVisible(true);
      return;
    }
    if (!selection.selected.size) return;
    session.current = {};
    refreshRequest.current = null;
    setRefreshError('');
    setProgressError('');
    const items = [...selection.selected.values()].map((item) => ({
      ...item,
      inCurrentPage: selection.currentIds.has(item.id),
      source: item.sourcePage
        ? `第${item.sourcePage}页`
        : selection.currentIds.has(item.id)
          ? '当前页'
          : '其他页',
    }));
    setWorkspace({
      items,
      currentCount: selection.currentCount,
      query,
      rows: items.map((item) => ({
        id: item.id,
        command: { type: 'delete-permanent' },
        state: 'unsent',
      })),
      phase: 'confirm',
      message: '',
    });
    setVisible(true);
  }
  function close() {
    controller.current?.abort();
    setVisible(false);
    if (workspace?.phase === 'confirm') {
      setWorkspace(null);
      session.current = null;
    }
    requestAnimationFrame(() => {
      if (source.current?.isConnected)
        source.current.focus({ preventScroll: true });
      else {
        const target =
          document.querySelector<HTMLElement>(
            '[data-testid="library-selection"] button[aria-label^="操作已选"]',
          ) ?? document.querySelector<HTMLElement>('#trash-title');
        target?.focus({ preventScroll: true });
      }
    });
  }
  function expire() {
    selection.clear();
    setWorkspace(null);
    setVisible(false);
    session.current = null;
    onExpire();
  }
  async function refresh(results: BatchItemResult[], command: CleanupCommand) {
    const current = session.current;
    if (!current || !results.length) return;
    const request = { results, command };
    refreshRequest.current = request;
    setRefreshPending(true);
    try {
      await onRefresh(results, command);
      if (session.current === current && refreshRequest.current === request) {
        refreshRequest.current = null;
        setRefreshError('');
      }
    } catch (error) {
      if (session.current === current && refreshRequest.current === request)
        setRefreshError(messageFor(error));
    } finally {
      if (session.current === current) setRefreshPending(false);
    }
  }
  function reconcile(results: BatchItemResult[]) {
    for (const result of results) {
      if (result.status === 'unknown') {
        if (!result.inQuery) selection.remove(result.id);
      } else if (result.status !== 'failed' || !result.inQuery)
        selection.remove(result.id);
      else selection.recordFailure(result.id, result.message);
    }
  }
  async function run(
    ids: string[],
    mode: 'apply' | 'check',
    retryTasks = false,
  ) {
    if (
      inFlight.current ||
      !workspace ||
      !ids.length ||
      (mode === 'apply' && unknownIds.length)
    )
      return;
    const current = session.current;
    const active = new AbortController();
    controller.current = active;
    inFlight.current = true;
    setPending(true);
    setProgressError('');
    const target = new Set(ids);
    let rows = workspace.rows.map((row) => {
      if (!target.has(row.id) || mode === 'check') return row;
      return retryTasks
        ? retryCleanupRow(row)
        : { id: row.id, command: row.command, state: 'unsent' as const };
    });
    setWorkspace({ ...workspace, rows, phase: 'result', message: '' });
    const observed: BatchItemResult[] = [];
    try {
      for (const type of ['delete-permanent', 'retry-cleanup'] as const) {
        const targets = rows.filter(
          (row) => target.has(row.id) && row.command.type === type,
        );
        if (!targets.length) continue;
        const outcome = await requestBatch(
          targets.map((row) => row.id),
          workspace.query,
          cleanupCommandFor(targets),
          mode,
          active.signal,
          (results) => {
            observed.push(...results);
            reconcile(results);
            rows = recordCleanupResults(rows, results);
            setWorkspace((previous) => previous && { ...previous, rows });
          },
          mode === 'apply'
            ? (sent) => {
                const sentIds = new Set(sent);
                rows = rows.map((row) =>
                  sentIds.has(row.id)
                    ? {
                        id: row.id,
                        command: row.command,
                        state: 'waiting' as const,
                      }
                    : row,
                );
                setWorkspace((previous) => previous && { ...previous, rows });
              }
            : undefined,
        );
        if (active.signal.aborted) return;
        const unknown = new Set(outcome.unknownIds);
        rows = rows.map((row) =>
          unknown.has(row.id) && row.state !== 'unknown'
            ? { id: row.id, command: row.command, state: 'unknown' as const }
            : row,
        );
        setWorkspace(
          (previous) =>
            previous && { ...previous, rows, message: outcome.message },
        );
        if (mode === 'apply' && unknown.size) break;
      }
    } catch (error) {
      if (error instanceof BatchRequestError && error.status === 401) {
        expire();
        return;
      }
      // An aborted write may have been received. Only sent rows become unknown.
      rows = rows.map((row) =>
        row.state === 'waiting'
          ? {
              id: row.id,
              command: row.command,
              state: active.signal.aborted
                ? ('unknown' as const)
                : ('unsent' as const),
            }
          : row,
      );
      if (session.current === current)
        setWorkspace(
          (previous) =>
            previous && {
              ...previous,
              rows,
              message: active.signal.aborted
                ? rows.some((row) => row.state === 'unknown')
                  ? '已停止未发送的请求。已发送的结果待核对，后台清理继续执行。'
                  : '已停止未发送的请求。已受理的清理任务继续执行。'
                : messageFor(error),
            },
        );
    } finally {
      inFlight.current = false;
      if (session.current === current) setPending(false);
      if (observed.length && session.current === current) {
        notifyLibraryChanged();
        await refresh(observed, { type: 'delete-permanent' });
      }
    }
  }
  const readProgress = useEffectEvent(
    async (snapshot: TrashBatchWorkspace, signal: AbortSignal) => {
      const targets = snapshot.rows.filter(
        (row) =>
          row.state === 'task' &&
          (row.result.cleanup.status === 'queued' ||
            row.result.cleanup.status === 'running'),
      );
      const updates: BatchItemResult[] = [];
      try {
        const outcome = await requestBatch(
          targets.map((row) => row.id),
          snapshot.query,
          { type: 'delete-permanent' },
          'check',
          signal,
          (results) => updates.push(...results),
        );
        if (signal.aborted) return;
        const unread = updates.filter((result) => !result.cleanup);
        if (unread.length || outcome.unknownIds.length)
          setProgressError(
            unread.length
              ? unread
                  .map((result) => `${result.id}：${result.message}`)
                  .join('；')
              : outcome.message || '暂时无法读取清理进度，请重新核对。',
          );
        const confirmed = updates.filter((result) => !!result.cleanup);
        setWorkspace(
          (previous) =>
            previous && {
              ...previous,
              rows: recordCleanupResults(previous.rows, confirmed),
            },
        );
        const terminal = confirmed.filter(
          (result) =>
            result.cleanup?.status === 'succeeded' ||
            result.cleanup?.status === 'failed',
        );
        if (terminal.length) {
          notifyLibraryChanged();
          await refresh(terminal, { type: 'delete-permanent' });
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof BatchRequestError && error.status === 401) {
          expire();
          return;
        }
        setProgressError(messageFor(error));
      }
    },
  );
  const processing = !!workspace?.rows.some(
    (row) =>
      row.state === 'task' &&
      (row.result.cleanup.status === 'queued' ||
        row.result.cleanup.status === 'running'),
  );
  useEffect(() => {
    if (!visible || !workspace || pending || progressError || !processing)
      return;
    const active = new AbortController();
    const timer = setTimeout(() => {
      void readProgress(workspace, active.signal);
    }, 1000);
    return () => {
      clearTimeout(timer);
      active.abort();
    };
  }, [visible, workspace, pending, progressError, processing, progressAttempt]);
  return {
    workspace,
    visible,
    pending,
    unknownIds,
    unsentIds,
    failedIds,
    failedTaskIds,
    unresolved: unknownIds.length > 0,
    open,
    close,
    reopen: () => setVisible(true),
    submit: () =>
      workspace &&
      void run(
        workspace.items.map((item) => item.id),
        'apply',
      ),
    check: () => void run(unknownIds, 'check'),
    checkItem: (id: string) => {
      const row = workspace?.rows.find((row) => row.id === id);
      if (row?.state === 'unknown') void run([id], 'check');
    },
    retryItem: (id: string) => {
      if (failedIds.includes(id) || unsentIds.includes(id))
        void run([id], 'apply');
    },
    retryTask: (id: string) => {
      if (failedTaskIds.includes(id)) void run([id], 'apply', true);
    },
    progressError,
    checkProgress: () => {
      setProgressError('');
      setProgressAttempt((value) => value + 1);
    },
    refreshError,
    refreshPending,
    retryRefresh: () => {
      const request = refreshRequest.current;
      if (request && !refreshPending)
        void refresh(request.results, request.command);
    },
    dismissResults: () => {
      if (!inFlight.current && !unknownIds.length && !unsentIds.length) {
        setWorkspace(null);
        setVisible(false);
        session.current = null;
      }
    },
  };
}
export type TrashBatch = ReturnType<typeof useTrashBatch>;
