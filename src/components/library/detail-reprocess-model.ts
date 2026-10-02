import type { LibraryDetail } from '../../server/library/detail-types';
import type { LibraryProcessingJob } from '../../server/library/types';
import type { ReprocessReceipt, ReprocessScope } from './request-reprocess';

export type ReprocessView =
  | {
      kind: 'selection';
      confirmation: Exclude<ReprocessScope, 'all'> | null;
    }
  | {
      kind: 'all-queued' | 'result';
      receipt: ReprocessReceipt;
      job: LibraryProcessingJob | null;
    };

export interface ReprocessState {
  imageId: string | null;
  scope: ReprocessScope;
  confirmed: boolean;
  receipt: ReprocessReceipt | null;
  error: string;
  unknown: boolean;
  pending: boolean;
  checking: boolean;
  readError: Error | null;
  dismissedJobId: string | null;
  submitted: { scope: ReprocessScope; previousJobId: string | null } | null;
  checkedDetail: LibraryDetail | null;
}

export interface ReprocessReadState {
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

export function reprocessAvailability(
  state: ReprocessState,
  detail: LibraryDetail | undefined,
  query: ReprocessReadState,
) {
  const checking = state.checking || query.isFetching;
  const readError = query.isError ? query.error : state.readError;
  const choicesDisabled =
    !detail || state.pending || checking || query.isError || !!readError;
  return {
    checking,
    readError,
    choicesDisabled,
    canSubmit:
      !!detail &&
      !choicesDisabled &&
      !state.unknown &&
      !state.receipt &&
      !detail.reprocess.scopes[state.scope],
    canResume:
      !!detail &&
      state.unknown &&
      state.checkedDetail === detail &&
      !state.pending &&
      !checking &&
      !query.isError &&
      !readError &&
      !hasActiveTask(detail),
  };
}

export function resumeReprocessState(
  state: ReprocessState,
  detail: LibraryDetail | undefined,
  query: ReprocessReadState,
): ReprocessState {
  return reprocessAvailability(state, detail, query).canResume
    ? initialReprocessState(state.imageId, detail?.processingJob?.id ?? null)
    : state;
}

export function initialReprocessState(
  imageId: string | null,
  dismissedJobId: string | null = null,
): ReprocessState {
  return {
    imageId,
    scope: 'all',
    confirmed: false,
    receipt: null,
    error: '',
    unknown: false,
    pending: false,
    checking: false,
    readError: null,
    dismissedJobId,
    submitted: null,
    checkedDetail: null,
  };
}

export function hasActiveTask(detail: LibraryDetail) {
  return (
    detail.processingStatus === 'pending' ||
    detail.processingStatus === 'processing' ||
    detail.activeJob?.status === 'queued' ||
    detail.activeJob?.status === 'running' ||
    detail.processingJob?.status === 'queued' ||
    detail.processingJob?.status === 'running' ||
    detail.metadataJob?.status === 'queued' ||
    detail.metadataJob?.status === 'running'
  );
}

export function observeReprocessDetail(
  state: ReprocessState,
  detail: LibraryDetail,
  verified: boolean,
): ReprocessState {
  const job = detail.processingJob;
  let next = verified
    ? { ...state, checkedDetail: detail, readError: null }
    : state;
  if (state.receipt) return next;
  if (state.unknown) {
    if (
      !verified ||
      !job ||
      !state.submitted ||
      job.id === state.submitted.previousJobId ||
      job.scope !== state.submitted.scope
    )
      return next;
  } else if (
    state.pending ||
    !job ||
    (detail.processingStatus !== 'ready' &&
      detail.processingStatus !== 'failed') ||
    (job.status !== 'queued' && job.status !== 'running') ||
    job.id === state.dismissedJobId
  ) {
    return next;
  }
  next = {
    ...next,
    confirmed: false,
    receipt: {
      jobId: job.id,
      status: 'queued',
      scope: job.scope,
      expectedVersions: job.expectedVersions,
    },
    unknown: false,
    error: '',
    submitted: null,
  };
  return next;
}

export function reprocessView(
  state: ReprocessState,
  detail: LibraryDetail | undefined,
): ReprocessView {
  if (!state.receipt)
    return {
      kind: 'selection',
      confirmation:
        state.confirmed && state.scope !== 'all' ? state.scope : null,
    };
  const job = receiptJob(detail, state.receipt);
  return {
    kind:
      state.receipt.scope !== 'all' || (job && job.status !== 'queued')
        ? 'result'
        : 'all-queued',
    receipt: state.receipt,
    job,
  };
}

export function receiptJob(
  detail: LibraryDetail | undefined,
  receipt: ReprocessReceipt,
): LibraryProcessingJob | null {
  return detail?.processingJob?.id === receipt.jobId
    ? detail.processingJob
    : null;
}
