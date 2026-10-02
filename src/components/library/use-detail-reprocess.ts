'use client';

import { useEffect, useRef, useState } from 'react';
import type { LibraryDetail } from '../../server/library/detail-types';
import {
  initialReprocessState,
  observeReprocessDetail,
  reprocessAvailability,
  reprocessView,
  resumeReprocessState,
  type ReprocessView,
} from './detail-reprocess-model';
import { versionLabels } from './detail-labels';
import { DetailReadError } from './read-detail';
import {
  requestDetailReprocess,
  type ReprocessScope,
  type ReprocessReceipt,
} from './request-reprocess';

export interface ReprocessQuery {
  data: LibraryDetail | undefined;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  expired: boolean;
  refetch: () => Promise<{
    data: LibraryDetail | undefined;
    isError: boolean;
    error: Error | null;
  }>;
  onMutationPending: (pending: boolean) => void;
  setUnavailable: (status: 401 | 404) => void;
}

export interface ReprocessNavigation {
  onReturn: () => void;
  onClose: () => void;
  onVersions: () => void;
  onOpen: () => void;
}

export interface DetailReprocessFooterAction {
  label: string;
  variant: 'primary' | 'outline';
  disabled: boolean;
  onPress: () => void;
  testId?: string;
}

export interface DetailReprocessController {
  scope: ReprocessScope;
  confirmed: boolean;
  receipt: ReprocessReceipt | null;
  error: string;
  unknown: boolean;
  pending: boolean;
  detail: LibraryDetail | undefined;
  view: ReprocessView;
  canSubmit: boolean;
  choicesDisabled: boolean;
  checking: boolean;
  readError: Error | null;
  canResume: boolean;
  reset: () => void;
  choose: (scope: ReprocessScope) => void;
  cancelConfirmation: () => void;
  submit: () => Promise<void>;
  reconcile: () => Promise<void>;
  resume: () => void;
  open: () => void;
  returnToDetail: () => void;
  footerActions: DetailReprocessFooterAction[] | null;
}

export function useDetailReprocess(
  imageId: string | null,
  query: ReprocessQuery,
  navigation: ReprocessNavigation,
): DetailReprocessController {
  const [savedState, setState] = useState(() => initialReprocessState(imageId));
  const state =
    savedState.imageId === imageId
      ? savedState
      : initialReprocessState(imageId);
  if (savedState !== state) setState(state);
  const detail =
    !query.expired && query.data?.id === imageId ? query.data : undefined;
  const currentImage = useRef(imageId);
  currentImage.current = imageId;
  const request = useRef<{
    imageId: string;
    controller: AbortController;
  } | null>(null);
  const check = useRef<symbol | null>(null);
  const previousRead = useRef({ imageId, data: detail, fetching: false });

  useEffect(() => {
    const previous = previousRead.current;
    previousRead.current = {
      imageId,
      data: detail,
      fetching: query.isFetching,
    };
    if (query.expired || !detail || query.isFetching) return;
    if (query.isError) {
      setState((current) =>
        current.imageId === imageId
          ? { ...current, checkedDetail: null, readError: query.error }
          : current,
      );
      return;
    }
    const verified =
      previous.imageId === imageId &&
      (previous.fetching || previous.data !== detail);
    setState((current) =>
      current.imageId === imageId
        ? observeReprocessDetail(current, detail, verified)
        : current,
    );
  }, [
    imageId,
    detail,
    query.isFetching,
    query.isError,
    query.error,
    query.expired,
  ]);

  useEffect(
    () => () => {
      if (request.current?.imageId === imageId) {
        request.current.controller.abort();
        request.current = null;
      }
      check.current = null;
    },
    [imageId],
  );

  const { checking, readError, choicesDisabled, canSubmit, canResume } =
    reprocessAvailability(state, detail, query);
  const view = reprocessView(state, detail);

  async function reconcile() {
    if (
      !imageId ||
      currentImage.current !== imageId ||
      query.expired ||
      check.current
    )
      return;
    const token = Symbol();
    check.current = token;
    setState((current) => ({
      ...current,
      checking: true,
      checkedDetail: null,
    }));
    try {
      const result = await query.refetch();
      if (currentImage.current !== imageId || check.current !== token) return;
      setState((current) => {
        if (current.imageId !== imageId) return current;
        if (result.isError)
          return { ...current, checkedDetail: null, readError: result.error };
        if (result.data?.id !== imageId) return current;
        return observeReprocessDetail(current, result.data, true);
      });
    } catch (error) {
      if (currentImage.current !== imageId || check.current !== token) return;
      setState((current) => ({
        ...current,
        checkedDetail: null,
        readError: error instanceof Error ? error : new Error(String(error)),
      }));
    } finally {
      if (check.current === token) {
        check.current = null;
        setState((current) =>
          current.imageId === imageId
            ? { ...current, checking: false }
            : current,
        );
      }
    }
  }

  async function submit() {
    if (!imageId || !detail || !canSubmit || request.current) return;
    const controller = new AbortController();
    const submission = { imageId, controller };
    const scope = state.scope;
    request.current = submission;
    setState((current) => ({
      ...current,
      pending: true,
      error: '',
      checkedDetail: null,
      submitted: { scope, previousJobId: detail.processingJob?.id ?? null },
    }));
    query.onMutationPending(true);
    try {
      const receipt = await requestDetailReprocess(
        imageId,
        scope,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        currentImage.current !== imageId ||
        request.current !== submission
      )
        return;
      setState((current) => ({
        ...current,
        receipt,
        confirmed: false,
        submitted: null,
      }));
      await reconcile();
    } catch (error) {
      if (
        controller.signal.aborted ||
        currentImage.current !== imageId ||
        request.current !== submission
      )
        return;
      if (error instanceof DetailReadError && error.status === 401)
        query.setUnavailable(401);
      setState((current) => ({
        ...current,
        unknown: !(error instanceof DetailReadError),
        submitted: error instanceof DetailReadError ? null : current.submitted,
        error:
          error instanceof DetailReadError
            ? error.message
            : '连接中断或响应无法读取，提交结果待核对。不会自动重新提交。',
      }));
      await reconcile();
    } finally {
      if (request.current === submission) request.current = null;
      query.onMutationPending(false);
      if (!controller.signal.aborted)
        setState((current) =>
          current.imageId === imageId
            ? { ...current, pending: false }
            : current,
        );
    }
  }

  function clear() {
    setState(initialReprocessState(imageId, detail?.processingJob?.id ?? null));
  }
  function reset() {
    if (!state.pending && !state.unknown) clear();
  }
  function resume() {
    setState((current) => resumeReprocessState(current, detail, query));
  }
  function choose(scope: ReprocessScope) {
    if (choicesDisabled || detail?.reprocess.scopes[scope]) return;
    setState((current) => ({
      ...current,
      scope,
      confirmed: scope !== 'all',
      error: current.unknown ? current.error : '',
    }));
  }
  function cancelConfirmation() {
    if (!state.pending)
      setState((current) => ({ ...current, confirmed: false }));
  }
  function open() {
    if (
      view.kind === 'result' &&
      view.job &&
      (view.job.status === 'succeeded' ||
        view.job.status === 'failed' ||
        view.job.status === 'cancelled')
    )
      reset();
    navigation.onOpen();
  }
  function returnToDetail() {
    if (!state.pending) navigation.onReturn();
  }

  let footerActions: DetailReprocessFooterAction[] | null;
  if (view.kind === 'selection' && view.confirmation) {
    footerActions = null;
  } else if (view.kind === 'result') {
    const queued = !view.job || view.job.status === 'queued';
    const succeeded = view.job?.status === 'succeeded';
    const failed =
      view.job?.status === 'failed' || view.job?.status === 'cancelled';
    footerActions = [
      {
        label: succeeded ? '返回图库' : queued ? '返回图片详情' : '返回详情',
        variant: queued ? 'primary' : 'outline',
        disabled: state.pending,
        onPress: succeeded ? navigation.onClose : returnToDetail,
      },
    ];
    if (!queued)
      footerActions.push({
        label: failed
          ? '按最新设置重试'
          : succeeded
            ? '查看图片详情'
            : '查看处理结果',
        variant: 'primary',
        disabled: state.pending,
        onPress: failed
          ? reset
          : succeeded
            ? returnToDetail
            : navigation.onVersions,
      });
  } else {
    let label = '开始全部重处理';
    if (state.pending) label = '正在提交…';
    else if (state.scope !== 'all')
      label = `重新生成${versionLabels[state.scope]}`;
    else if (detail?.processingStatus === 'failed') label = '重试全部处理';
    footerActions = [
      {
        label: '返回详情',
        variant: 'outline',
        disabled: state.pending,
        onPress: returnToDetail,
      },
      view.kind === 'all-queued'
        ? {
            label: '返回处理范围',
            variant: 'outline',
            disabled: state.pending,
            onPress: reset,
          }
        : {
            label,
            variant: 'primary',
            disabled: !canSubmit,
            onPress:
              state.scope === 'all'
                ? () => {
                    void submit();
                  }
                : () => choose(state.scope),
            testId: 'reprocess-submit',
          },
    ];
  }

  return {
    scope: state.scope,
    confirmed: state.confirmed,
    receipt: state.receipt,
    error: state.error,
    unknown: state.unknown,
    pending: state.pending,
    detail,
    view,
    canSubmit,
    choicesDisabled,
    checking,
    readError,
    canResume,
    reset,
    choose,
    cancelConfirmation,
    submit,
    reconcile,
    resume,
    open,
    returnToDetail,
    footerActions,
  };
}
