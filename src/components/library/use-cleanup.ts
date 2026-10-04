'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { LibraryDetail } from '../../server/library/detail-types';
import type { LibraryCleanupTask } from '../../server/library/batch-types';
import { notifyLibraryChanged } from './library-changes';
import {
  cleanupAttemptConfirmed,
  CleanupRequestError,
  requestCleanup,
} from './cleanup-request';

export function useCleanup({
  record,
  onExpire,
  onRefresh,
}: {
  record: LibraryDetail | undefined;
  onExpire: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [visible, setVisible] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [storageConfirmed, setStorageConfirmed] = useState(false);
  const [progress, setProgress] = useState(false);
  const [task, setTask] = useState<LibraryCleanupTask | null>(null);
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const request = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const submitted = useRef<{ jobId: string; cycle: number } | null | undefined>(
    undefined,
  );
  const trigger = useRef<HTMLElement | null>(null);
  const imageId = record?.id;
  const previousImage = useRef(imageId);
  const [stateImageId, setStateImageId] = useState(imageId);
  async function refresh() {
    try {
      await onRefresh();
      setRefreshError('');
    } catch (failure) {
      setRefreshError(
        failure instanceof Error ? failure.message : String(failure),
      );
    }
  }
  if (imageId && stateImageId !== imageId) {
    setStateImageId(imageId);
    setVisible(false);
    setConfirmation(false);
    setStorageConfirmed(false);
    setProgress(false);
    setTask(null);
    setUnknown(false);
    setError('');
    setRefreshError('');
    setPending(false);
  }
  useEffect(() => {
    if (imageId && previousImage.current !== imageId) {
      submitted.current = undefined;
      previousImage.current = imageId;
    }
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [imageId]);

  function observe(current: LibraryCleanupTask) {
    setTask(current);
    const confirmed =
      submitted.current === undefined ||
      cleanupAttemptConfirmed(current, submitted.current);
    setUnknown(!confirmed);
    if (!confirmed) {
      setError(
        '已读取原清理周期，但尚未确认本次重试受理。请稍后核对，不会自动重新提交。',
      );
      return;
    }
    submitted.current = undefined;
    setError('');
    setConfirmation(false);
    if (current.status !== task?.status || current.cycle !== task?.cycle) {
      notifyLibraryChanged();
      void refresh();
    }
  }

  async function check() {
    if (!imageId || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      const current = await requestCleanup(imageId, 'read', controller.signal);
      if (!controller.signal.aborted) observe(current);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof CleanupRequestError && failure.status === 401)
        onExpire();
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  const poll = useEffectEvent(check);
  useEffect(() => {
    if (
      !visible ||
      confirmation ||
      pending ||
      unknown ||
      error ||
      !task ||
      (task.status !== 'queued' && task.status !== 'running')
    )
      return;
    const timer = setTimeout(() => {
      void poll();
    }, 1000);
    return () => clearTimeout(timer);
  }, [visible, confirmation, pending, unknown, error, task]);

  async function submit(retry = false) {
    if (
      !imageId ||
      request.current ||
      unknown ||
      (retry && task?.status !== 'failed') ||
      (!retry && (!record?.trashedAt || record.deletionStatus || task))
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    writing.current = true;
    submitted.current =
      retry && task ? { jobId: task.jobId, cycle: task.cycle } : null;
    try {
      const current = await requestCleanup(
        imageId,
        retry ? 'retry' : 'delete',
        controller.signal,
      );
      if (!controller.signal.aborted) {
        // A successful write response confirms acceptance even if another page
        // advanced the task since this page last read it.
        submitted.current = undefined;
        observe(current);
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof CleanupRequestError && failure.status === 401)
        onExpire();
      const uncertain =
        !(failure instanceof CleanupRequestError) || failure.status >= 500;
      setUnknown(uncertain);
      setConfirmation(!uncertain && !retry);
      setError(failure instanceof Error ? failure.message : String(failure));
      if (uncertain) {
        setConfirmation(false);
        try {
          const current = await requestCleanup(
            imageId,
            'read',
            controller.signal,
          );
          if (!controller.signal.aborted) observe(current);
        } catch (readFailure) {
          if (!controller.signal.aborted) {
            if (
              readFailure instanceof CleanupRequestError &&
              readFailure.status === 401
            )
              onExpire();
            setError(
              `${failure instanceof Error ? failure.message : String(failure)}；核对失败：${readFailure instanceof Error ? readFailure.message : String(readFailure)}`,
            );
          }
        }
      } else submitted.current = undefined;
    } finally {
      writing.current = false;
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function open(element?: HTMLElement) {
    trigger.current = element ?? null;
    setVisible(true);
    if (!record?.deletionStatus && !task && !unknown) {
      setConfirmation(true);
      setStorageConfirmed(false);
    } else {
      setConfirmation(false);
      void check();
    }
  }
  function close() {
    if (writing.current) setUnknown(true);
    request.current?.abort();
    request.current = null;
    setPending(false);
    setVisible(false);
    setConfirmation(false);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
    });
  }
  return {
    visible,
    confirmation,
    storageConfirmed,
    progress,
    record,
    task,
    pending,
    unknown,
    error,
    refreshError,
    open,
    close,
    check,
    showProgress: () => setProgress(true),
    confirmStorage: () => setStorageConfirmed(true),
    submit: () => submit(),
    retry: () => submit(true),
    retryRefresh: () => {
      void refresh();
    },
  };
}

export type CleanupController = ReturnType<typeof useCleanup>;
