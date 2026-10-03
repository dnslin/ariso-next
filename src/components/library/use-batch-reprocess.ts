'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type {
  BatchCommand,
  BatchItemResult,
} from '../../server/library/batch-types';
import type { LibrarySelection } from '../../app/library/use-library-selection';
import { BatchRequestError, requestBatch } from './batch-request';
import { notifyLibraryChanged } from './library-changes';
import {
  failedTaskIds,
  reprocessScopes,
  rowState,
  type ReprocessRow,
  type ReprocessScope,
  type ReprocessWorkspace,
} from './batch-reprocess-state';

type ReprocessCommand = Extract<BatchCommand, { type: 'reprocess' }>;
function commandFor(
  rows: ReprocessRow[],
  scope: ReprocessScope,
): ReprocessCommand {
  return {
    type: 'reprocess',
    scope,
    taskIds: Object.fromEntries(
      rows.map((row) => [row.id, row.attempt.taskId]),
    ),
  };
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function useBatchReprocess({
  selection,
  query,
  onExpire,
  onRefresh,
  currentAlbumId,
}: {
  selection: LibrarySelection;
  query: string;
  currentAlbumId?: string;
  onExpire: () => void;
  onRefresh: (
    results: BatchItemResult[],
    command: BatchCommand,
  ) => Promise<unknown>;
}) {
  const [workspace, setWorkspace] = useState<ReprocessWorkspace | null>(null);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [showFailures, setShowFailures] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [progressAttempt, setProgressAttempt] = useState(0);
  const [refreshError, setRefreshError] = useState('');
  const [refreshPending, setRefreshPending] = useState(false);
  const refreshRequest = useRef<{
    results: BatchItemResult[];
    command: ReprocessCommand;
  } | null>(null);
  const session = useRef<object | null>(null);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const source = useRef<HTMLElement | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      session.current = null;
    },
    [],
  );
  const unknownIds =
    workspace?.rows
      .filter((row) => row.outcome.state === 'unknown')
      .map((row) => row.id) ?? [];
  const unsentIds =
    workspace?.rows
      .filter((row) => row.outcome.state === 'unsent')
      .map((row) => row.id) ?? [];
  const failedIds =
    workspace?.rows
      .filter(
        (row) =>
          row.outcome.state === 'rejected' &&
          row.outcome.result.inQuery &&
          selection.selected.has(row.id),
      )
      .map((row) => row.id) ?? [];
  function open(element: HTMLElement) {
    if (inFlight.current) return;
    source.current = element;
    if (unknownIds.length) {
      setVisible(true);
      return;
    }
    if (!selection.selected.size) return;
    session.current = {};
    refreshRequest.current = null;
    setRefreshError('');
    setProgressError('');
    setShowFailures(false);
    setWorkspace({
      action: 'reprocess',
      items: [...selection.selected.values()].map((item) => ({
        ...item,
        inCurrentPage: selection.currentIds.has(item.id),
        source: item.sourcePage
          ? `第${item.sourcePage}页`
          : selection.currentIds.has(item.id)
            ? '当前页'
            : '其他页',
      })),
      currentCount: selection.currentCount,
      query,
      scope: 'all',
      rows: [],
      message: '',
      phase: 'choose',
    });
    setVisible(true);
  }
  function close() {
    if (inFlight.current) return;
    setVisible(false);
    if (!unknownIds.length) {
      setWorkspace(null);
      session.current = null;
    }
    requestAnimationFrame(() => {
      if (source.current?.isConnected)
        source.current.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLElement>(
            '[data-testid="library-toolbar"] input, #library-title',
          )
          ?.focus({ preventScroll: true });
    });
  }
  function expire() {
    selection.clear();
    setWorkspace(null);
    setVisible(false);
    session.current = null;
    onExpire();
  }
  // List refresh is independent of the polling request's lifetime. Confirming
  // the final task stops that effect, but must not suppress a later refresh error.
  async function refresh(
    results: BatchItemResult[],
    command: ReprocessCommand,
  ) {
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
        setRefreshError(errorMessage(error));
    } finally {
      if (session.current === current) setRefreshPending(false);
    }
  }
  function recordResults(rows: ReprocessRow[], results: BatchItemResult[]) {
    const byId = new Map(results.map((result) => [result.id, result]));
    return rows.map((row): ReprocessRow => {
      const result = byId.get(row.id);
      if (!result) return row;
      if (result.status === 'accepted')
        return { ...row, outcome: { state: 'accepted', result } };
      if (result.status === 'failed')
        return {
          ...row,
          outcome: {
            state: 'rejected',
            result: { ...result, status: 'failed' },
          },
        };
      return { ...row, outcome: { state: 'unknown' } };
    });
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
    scopeOverride?: ReprocessScope,
  ) {
    if (inFlight.current || !workspace || !ids.length) return;
    const unsentScopes = workspace.rows
      .filter((row) => row.outcome.state === 'unsent')
      .map((row) => row.attempt.scope);
    if (
      mode === 'apply' &&
      (unknownIds.length ||
        (scopeOverride &&
          unsentScopes.some((scope) => scope !== scopeOverride)))
    )
      return;
    const current = session.current;
    inFlight.current = true;
    setPending(true);
    setProgressError('');
    setShowFailures(false);
    const existing = new Map(workspace.rows.map((row) => [row.id, row]));
    let rows = workspace.items.map((item): ReprocessRow => {
      const previous = existing.get(item.id);
      if (!ids.includes(item.id)) return previous!;
      if (mode === 'check') return previous!;
      return {
        id: item.id,
        attempt:
          previous?.outcome.state === 'unsent'
            ? previous.attempt
            : {
                taskId: crypto.randomUUID(),
                scope:
                  scopeOverride ?? previous?.attempt.scope ?? workspace.scope,
              },
        outcome: { state: 'waiting' },
      };
    });
    const active = new AbortController();
    controller.current = active;
    setWorkspace({
      ...workspace,
      rows,
      phase: 'result',
      message: '',
    });
    const observed: BatchItemResult[] = [];
    try {
      const messages: string[] = [];
      for (const groupScope of reprocessScopes) {
        const targets = rows.filter(
          (row) => ids.includes(row.id) && row.attempt.scope === groupScope,
        );
        if (!targets.length) continue;
        const outcome = await requestBatch(
          targets.map((row) => row.id),
          workspace.query,
          commandFor(targets, groupScope),
          mode,
          active.signal,
          (results) => {
            if (active.signal.aborted) return;
            observed.push(...results);
            reconcile(results);
            rows = recordResults(rows, results);
            setWorkspace((previous) => previous && { ...previous, rows });
          },
        );
        if (active.signal.aborted) return;
        const unknown = new Set(outcome.unknownIds);
        const unsent = new Set(outcome.unsentIds);
        rows = rows.map((row) =>
          unknown.has(row.id)
            ? { ...row, outcome: { state: 'unknown' } }
            : unsent.has(row.id) && mode === 'apply'
              ? { ...row, outcome: { state: 'unsent' } }
              : row,
        );
        if (outcome.message) messages.push(outcome.message);
        if (mode === 'apply' && unknown.size)
          rows = rows.map((row) =>
            row.outcome.state === 'waiting'
              ? { ...row, outcome: { state: 'unsent' } }
              : row,
          );
        setWorkspace(
          (previous) =>
            previous && {
              ...previous,
              rows,
              message: messages.join(' '),
            },
        );
        if (mode === 'apply' && unknown.size) break;
      }
      if (observed.length) {
        notifyLibraryChanged();
        await refresh(
          observed,
          commandFor(
            rows.filter((row) => ids.includes(row.id)),
            workspace.scope,
          ),
        );
      }
    } catch (error) {
      if (active.signal.aborted) return;
      if (error instanceof BatchRequestError && error.status === 401) {
        expire();
        return;
      }
      rows = rows.map((row) =>
        row.outcome.state === 'waiting'
          ? { ...row, outcome: { state: 'unsent' } }
          : row,
      );
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            rows,
            message: errorMessage(error),
          },
      );
    } finally {
      inFlight.current = false;
      if (!active.signal.aborted && session.current === current)
        setPending(false);
    }
  }
  const readProgress = useEffectEvent(
    async (snapshot: ReprocessWorkspace, signal: AbortSignal) => {
      const targets = snapshot.rows.filter(
        (row) => rowState(row) === 'queued' || rowState(row) === 'running',
      );
      const updates: BatchItemResult[] = [];
      try {
        const outcomes = await Promise.all(
          reprocessScopes.map((scope) => {
            const scoped = targets.filter((row) => row.attempt.scope === scope);
            return requestBatch(
              scoped.map((row) => row.id),
              snapshot.query,
              commandFor(scoped, scope),
              'check',
              signal,
              (results) => updates.push(...results),
            );
          }),
        );
        if (signal.aborted) return;
        if (outcomes.some((outcome) => outcome.unknownIds.length))
          setProgressError(
            outcomes
              .map((outcome) => outcome.message)
              .filter(Boolean)
              .join(' ') || '暂时无法读取本任务进度，请再次读取。',
          );
        const confirmed = updates.filter(
          (result) => result.status !== 'unknown',
        );
        setWorkspace(
          (previous) =>
            previous && {
              ...previous,
              rows: recordResults(previous.rows, confirmed),
            },
        );
        for (const result of confirmed)
          if (!result.inQuery) selection.remove(result.id);
        const terminal = confirmed.filter(
          (result) =>
            result.status === 'accepted' &&
            result.task.status !== 'queued' &&
            result.task.status !== 'running',
        );
        if (terminal.length) {
          notifyLibraryChanged();
          await refresh(
            terminal,
            commandFor(targets, targets[0].attempt.scope),
          );
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof BatchRequestError && error.status === 401) {
          expire();
          return;
        }
        setProgressError(errorMessage(error));
      }
    },
  );
  const processing = !!workspace?.rows.some(
    (row) => rowState(row) === 'queued' || rowState(row) === 'running',
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
    showFailures,
    toggleFailures: () => setShowFailures((value) => !value),
    returnLabel: currentAlbumId ? '返回相册内容' : '返回图库',
    unknownIds,
    unsentIds,
    failedIds,
    unresolved: !!unknownIds.length,
    open,
    close,
    reopen: () => setVisible(true),
    choose: (scope: ReprocessScope) =>
      setWorkspace((previous) =>
        previous?.phase === 'choose' ? { ...previous, scope } : previous,
      ),
    submit: () =>
      workspace &&
      void run(
        workspace.items.map((item) => item.id),
        'apply',
      ),
    check: () => void run(unknownIds, 'check'),
    retry: () => void run([...new Set([...failedIds, ...unsentIds])], 'apply'),
    retryFailures: () => void run(failedIds, 'apply'),
    retryFailuresAll: () => void run(failedIds, 'apply', 'all'),
    retryTasks: (scope: ReprocessScope) =>
      workspace &&
      void run(failedTaskIds(workspace.rows, scope), 'apply', scope),
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
  };
}
export type BatchReprocess = ReturnType<typeof useBatchReprocess>;
