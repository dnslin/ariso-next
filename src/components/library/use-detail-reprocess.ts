'use client';

import { useEffect, useRef, useState } from 'react';
import { DetailReadError } from './read-detail';
import {
  requestDetailReprocess,
  type ReprocessScope,
  type ReprocessReceipt,
} from './request-reprocess';
import type { useDetailQuery } from './use-detail-query';

export function useDetailReprocess(
  imageId: string | null,
  query: ReturnType<typeof useDetailQuery>,
) {
  const initial = {
    imageId,
    scope: 'all' as ReprocessScope,
    confirmed: false,
    receipt: null as ReprocessReceipt | null,
    error: '',
    unknown: false,
    pending: false,
    dismissedJobId: null as string | null,
  };
  const [state, setState] = useState(initial);
  if (state.imageId !== imageId) setState(initial);
  const active = query.data?.processingJob;
  if (
    state.imageId === imageId &&
    !state.receipt &&
    active &&
    (query.data?.processingStatus === 'ready' ||
      query.data?.processingStatus === 'failed') &&
    (active.status === 'queued' || active.status === 'running') &&
    state.dismissedJobId !== active.id
  ) {
    setState((current) => ({
      ...current,
      receipt: {
        jobId: active.id,
        status: 'queued',
        scope: active.scope,
        expectedVersions: active.expectedVersions,
      },
    }));
  }
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [imageId]);
  async function submit() {
    if (
      !imageId ||
      !query.data ||
      request.current ||
      query.data.reprocess.scopes[state.scope] ||
      state.unknown ||
      state.receipt
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setState((current) => ({ ...current, pending: true, error: '' }));
    query.onMutationPending(true);
    try {
      const receipt = await requestDetailReprocess(
        imageId,
        state.scope,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      setState((current) => ({ ...current, receipt }));
      await query.refetch();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DetailReadError && error.status === 401)
        query.setUnavailable(401);
      setState((current) => ({
        ...current,
        unknown: !(error instanceof DetailReadError),
        error:
          error instanceof DetailReadError
            ? error.message
            : '连接中断或响应无法读取，提交结果待核对。不会自动重新提交。',
      }));
      await query.refetch();
    } finally {
      if (request.current === controller) request.current = null;
      query.onMutationPending(false);
      if (!controller.signal.aborted)
        setState((current) => ({ ...current, pending: false }));
    }
  }
  return {
    ...state,
    choose: (scope: ReprocessScope) =>
      setState((current) => ({
        ...current,
        scope,
        confirmed: scope !== 'all',
        error: current.unknown ? current.error : '',
      })),
    cancelConfirmation: () =>
      setState((current) => ({ ...current, confirmed: false })),
    reset: () =>
      setState({
        ...initial,
        dismissedJobId: query.data?.processingJob?.id ?? null,
      }),
    submit,
  };
}
