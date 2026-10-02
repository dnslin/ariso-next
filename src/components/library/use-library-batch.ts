'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@heroui/react/toast';
import type {
  BatchCommand,
  BatchItemResult,
} from '../../server/library/batch-types';
import type { LibrarySelection } from '../../app/library/use-library-selection';
import type { SelectedLibraryItem } from '../../server/library/selection-types';
import { notifyLibraryChanged } from './library-changes';
import { BatchRequestError, requestBatch } from './batch-request';

export type BatchAction =
  Exclude<BatchCommand['type'], 'visibility'> | 'public' | 'private';
export type BatchSnapshotItem = SelectedLibraryItem & {
  source: string;
  inCurrentPage: boolean;
};
export interface BatchWorkspace {
  action: BatchAction;
  items: BatchSnapshotItem[];
  currentCount: number;
  query: string;
  command: BatchCommand | null;
  results: BatchItemResult[];
  unknownIds: string[];
  unsentIds: string[];
  message: string;
  checkFailed: boolean;
  retrying: boolean;
  phase: 'choose' | 'confirm' | 'result';
}
export const batchLabels: Record<BatchAction, string> = {
  'add-albums': '添加到相册',
  'remove-albums': '从相册移除',
  'add-tags': '添加标签',
  'remove-tags': '移除标签',
  public: '设为公开',
  private: '设为私有',
  trash: '移入回收站',
  restore: '恢复所选',
};

export function visibilityFeedback(
  workspace: Pick<
    BatchWorkspace,
    'command' | 'items' | 'results' | 'unknownIds' | 'unsentIds'
  >,
) {
  if (
    workspace.command?.type !== 'visibility' ||
    !workspace.items.length ||
    workspace.unknownIds.length ||
    workspace.unsentIds.length
  )
    return null;
  const byId = new Map(workspace.results.map((result) => [result.id, result]));
  let changed = 0;
  let unchanged = 0;
  for (const item of workspace.items) {
    const status = byId.get(item.id)?.status;
    if (status === 'changed') changed++;
    else if (status === 'unchanged') unchanged++;
    else return null;
  }
  return {
    title: `批量设为${workspace.command.visibility === 'public' ? '公开' : '私有'}完成`,
    description: `${changed}张已修改 · ${unchanged}张无需修改`,
  };
}

export function useLibraryBatch({
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
  onRefresh: () => Promise<unknown>;
}) {
  const [workspace, setWorkspace] = useState<BatchWorkspace | null>(null);
  const [visible, setVisible] = useState(false);
  const [targetReady, setTargetReady] = useState(false);
  const [showFailures, setShowFailures] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const source = useRef<HTMLElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function open(action: BatchAction, element: HTMLElement) {
    if (inFlight.current) return;
    source.current = element;
    setTargetReady(false);
    setShowFailures(false);
    if (workspace?.unknownIds.length) {
      setVisible(true);
      return;
    }
    if (!selection.selected.size) return;
    const items = [...selection.selected.values()].map((item) => ({
      ...item,
      inCurrentPage: selection.currentIds.has(item.id),
      source: item.sourcePage
        ? `第${item.sourcePage}页`
        : selection.currentIds.has(item.id)
          ? '当前页'
          : '其他页',
    }));
    const command: BatchCommand | null =
      action === 'public' || action === 'private'
        ? { type: 'visibility', visibility: action }
        : action === 'trash' || action === 'restore'
          ? { type: action }
          : action === 'remove-albums' && currentAlbumId
            ? { type: action, albumIds: [currentAlbumId] }
            : null;
    setWorkspace({
      action,
      items,
      currentCount: selection.currentCount,
      query,
      command,
      results: [],
      unknownIds: [],
      unsentIds: [],
      message: '',
      checkFailed: false,
      retrying: false,
      phase: command && action !== 'remove-albums' ? 'confirm' : 'choose',
    });
    setVisible(true);
  }
  function focusSource() {
    requestAnimationFrame(() => {
      const target = source.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLElement>(
            '[data-testid="library-toolbar"] input, #trash-title, #library-title',
          )
          ?.focus({ preventScroll: true });
    });
  }
  function close() {
    if (inFlight.current) return;
    setVisible(false);
    if (!workspace?.unknownIds.length) setWorkspace(null);
    focusSource();
  }
  async function run(
    command: BatchCommand,
    mode: 'apply' | 'check',
    ids: string[],
  ) {
    if (inFlight.current || !workspace || !ids.length) return;
    if (mode === 'apply' && workspace.unknownIds.length) return;
    inFlight.current = true;
    setPending(true);
    setShowFailures(false);
    const retrying = mode === 'apply' && workspace.phase === 'result';
    const keepVisibilityConfirmation =
      command.type === 'visibility' &&
      mode === 'apply' &&
      workspace.phase === 'confirm';
    const items = retrying
      ? workspace.items.filter(
          (item) =>
            ids.includes(item.id) || workspace.unsentIds.includes(item.id),
        )
      : workspace.items;
    const previousResults = retrying
      ? []
      : workspace.results.filter((result) => !ids.includes(result.id));
    const resultsById = new Map(
      previousResults.map((result) => [result.id, result]),
    );
    const remainingUnsent = new Set(workspace.unsentIds);
    const active = new AbortController();
    controller.current = active;
    setWorkspace(
      (previous) =>
        previous && {
          ...previous,
          items,
          currentCount: retrying
            ? items.filter((item) => item.inCurrentPage).length
            : previous.currentCount,
          retrying: previous.retrying || retrying,
          results: previousResults,
          command,
          phase: keepVisibilityConfirmation ? 'confirm' : 'result',
          checkFailed: false,
          message: '',
        },
    );
    try {
      const outcome = await requestBatch(
        ids,
        workspace.query,
        command,
        mode,
        active.signal,
        (results) => {
          if (active.signal.aborted) return;
          for (const result of results) {
            resultsById.set(result.id, result);
            remainingUnsent.delete(result.id);
            if (result.status !== 'failed' || !result.inQuery)
              selection.remove(result.id);
            else selection.recordFailure(result.id, result.message);
          }
          const currentResults = [...resultsById.values()];
          setWorkspace((previous) => {
            if (!previous) return previous;
            const done = new Set(results.map((result) => result.id));
            return {
              ...previous,
              results: currentResults,
              unknownIds: previous.unknownIds.filter((id) => !done.has(id)),
              unsentIds: previous.unsentIds.filter((id) => !done.has(id)),
            };
          });
        },
      );
      if (active.signal.aborted) return;
      const unsentIds =
        mode === 'check'
          ? [...remainingUnsent]
          : [
              ...new Set([
                ...[...remainingUnsent].filter((id) => !ids.includes(id)),
                ...outcome.unsentIds,
              ]),
            ];
      const feedback = visibilityFeedback({
        command,
        items,
        results: [...resultsById.values()],
        unknownIds: outcome.unknownIds,
        unsentIds,
      });
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            ...outcome,
            phase:
              keepVisibilityConfirmation && feedback ? 'confirm' : 'result',
            checkFailed: mode === 'check' && outcome.unknownIds.length > 0,
            unsentIds,
          },
      );
      if (!outcome.unknownIds.length) {
        notifyLibraryChanged();
        let refreshError: string | null = null;
        try {
          await onRefresh();
        } catch (error) {
          if (!feedback) throw error;
          refreshError = error instanceof Error ? error.message : String(error);
        }
        if (feedback && !active.signal.aborted) {
          setWorkspace(null);
          setVisible(false);
          focusSource();
          toast.success(feedback.title, {
            description:
              refreshError !== null
                ? `${feedback.description}。列表刷新失败：${refreshError}，请刷新页面。`
                : feedback.description,
          });
        }
      }
    } catch (error) {
      if (active.signal.aborted) return;
      if (error instanceof BatchRequestError && error.status === 401) {
        selection.clear();
        setWorkspace(null);
        setVisible(false);
        onExpire();
        return;
      }
      setWorkspace(
        (previous) =>
          previous && {
            ...previous,
            phase: 'result',
            checkFailed: mode === 'check',
            message: error instanceof Error ? error.message : String(error),
            unsentIds:
              mode === 'apply'
                ? [
                    ...new Set([
                      ...previous.unsentIds.filter((id) => !ids.includes(id)),
                      ...ids.filter(
                        (id) =>
                          !previous.results.some((result) => result.id === id),
                      ),
                    ]),
                  ]
                : previous.unsentIds,
          },
      );
    } finally {
      inFlight.current = false;
      if (!active.signal.aborted) setPending(false);
    }
  }
  const failedIds =
    workspace?.results
      .filter(
        (result) =>
          result.status === 'failed' &&
          result.inQuery &&
          selection.selected.has(result.id),
      )
      .map((result) => result.id) ?? [];
  return {
    workspace,
    returnLabel: currentAlbumId ? '返回相册内容' : '返回图库',
    targetReady,
    setTargetReady,
    showFailures,
    toggleFailures: () => setShowFailures((value) => !value),
    visible,
    pending,
    open,
    close,
    unresolved: !!workspace?.unknownIds.length,
    reopen: () => setVisible(true),
    onExpire,
    choose: (command: BatchCommand | null) =>
      setWorkspace((previous) => previous && { ...previous, command }),
    submit: () =>
      workspace?.command &&
      void run(
        workspace.command,
        'apply',
        workspace.items.map((item) => item.id),
      ),
    check: () =>
      workspace?.command &&
      void run(workspace.command, 'check', workspace.unknownIds),
    retry: () =>
      workspace?.command &&
      void run(workspace.command, 'apply', [
        ...new Set([...failedIds, ...workspace.unsentIds]),
      ]),
    retryFailures: () =>
      workspace?.command && void run(workspace.command, 'apply', failedIds),
    failedIds,
  };
}
export type LibraryBatch = ReturnType<typeof useLibraryBatch>;
