import { expect, it } from 'vitest';
import type { LibraryDetail } from '../../../src/server/library/detail-types';
import type { LibraryProcessingJob } from '../../../src/server/library/types';
import {
  initialReprocessState,
  observeReprocessDetail,
  receiptJob,
  reprocessAvailability,
  reprocessView,
  resumeReprocessState,
  type ReprocessReadState,
  type ReprocessState,
} from '../../../src/components/library/detail-reprocess-model';

function job(
  overrides: Partial<LibraryProcessingJob> = {},
): LibraryProcessingJob {
  return {
    id: 'previous',
    status: 'succeeded',
    scope: 'all',
    expectedVersions: ['thumbnail'],
    generatedVersions: ['thumbnail'],
    step: 'complete',
    error: null,
    ...overrides,
  };
}

function detail(overrides: Partial<LibraryDetail> = {}): LibraryDetail {
  return {
    id: 'image',
    displayName: '图片',
    originalName: 'image.jpg',
    format: 'jpeg',
    mime: 'image/jpeg',
    width: 100,
    height: 100,
    byteSize: 100,
    animated: false,
    pageCount: 1,
    classification: 'static',
    visibility: 'public',
    processingStatus: 'ready',
    createdAt: '2026-10-02T00:00:00.000Z',
    trashedAt: null,
    deletionStatus: null,
    storage: { id: 'storage', name: '本地', enabled: true },
    albums: [],
    tags: [],
    versions: [],
    defaultVersion: 'original',
    defaultLink: {
      actualVersion: 'original',
      links: null,
      downloadPath: null,
      unavailableReason: null,
    },
    activeJob: null,
    latestFailedJob: null,
    metadataJob: null,
    processingJob: job(),
    reprocess: {
      scopes: { all: null, compressed: null, thumbnail: null, watermark: null },
      expectedVersions: ['thumbnail'],
      compressionEnabled: false,
      watermarkEnabled: false,
    },
    actions: {
      editUnavailableReason: null,
      reprocessUnavailableReason: null,
      metadataReadUnavailableReason: null,
    },
    ...overrides,
  };
}

const read: ReprocessReadState = {
  isFetching: false,
  isError: false,
  error: null,
};

function unknown(overrides: Partial<ReprocessState> = {}): ReprocessState {
  return {
    ...initialReprocessState('image'),
    scope: 'thumbnail',
    confirmed: true,
    unknown: true,
    error: '提交结果待核对',
    submitted: { scope: 'thumbnail', previousJobId: 'previous' },
    ...overrides,
  };
}

it.each(['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const)(
  'recognizes a newly observed matching %s task after a lost response',
  (status) => {
    const observed = detail({
      processingJob: job({ id: 'accepted', scope: 'thumbnail', status }),
    });
    const recovered = observeReprocessDetail(unknown(), observed, true);
    expect(recovered).toMatchObject({
      receipt: {
        jobId: 'accepted',
        scope: 'thumbnail',
        expectedVersions: ['thumbnail'],
      },
      unknown: false,
      confirmed: false,
      error: '',
      submitted: null,
    });
    expect(reprocessView(recovered, observed)).toMatchObject({
      kind: 'result',
      job: { id: 'accepted', status },
    });
    expect(reprocessAvailability(recovered, observed, read).canSubmit).toBe(
      false,
    );
  },
);

it.each(['queued', 'running'] as const)(
  'recovers the all-scope first-failure retry while image status is processing and task is %s',
  (status) => {
    const submitted = unknown({
      scope: 'all',
      submitted: { scope: 'all', previousJobId: 'previous' },
    });
    const observed = detail({
      processingStatus: 'processing',
      processingJob: job({ id: 'retry', status }),
    });
    const recovered = observeReprocessDetail(submitted, observed, true);
    expect(recovered).toMatchObject({
      unknown: false,
      receipt: { jobId: 'retry', scope: 'all' },
    });
    expect(reprocessView(recovered, observed).kind).toBe(
      status === 'queued' ? 'all-queued' : 'result',
    );
  },
);

it('keeps an unaccepted submission unknown until an explicit, available resume resets the range', () => {
  const observed = detail();
  const checked = observeReprocessDetail(unknown(), observed, true);
  expect(checked).toMatchObject({
    unknown: true,
    receipt: null,
    error: '提交结果待核对',
  });
  expect(reprocessAvailability(checked, observed, read)).toMatchObject({
    canSubmit: false,
    canResume: true,
  });
  const resumed = resumeReprocessState(checked, observed, read);
  expect(resumed).toEqual(initialReprocessState('image', 'previous'));
  expect(reprocessView(resumed, observed)).toEqual({
    kind: 'selection',
    confirmation: null,
  });
  expect(reprocessAvailability(resumed, observed, read).canSubmit).toBe(true);
});

it('does not treat unverified data as acceptance or permission to resume', () => {
  const submitted = unknown();
  const observed = detail({
    processingJob: job({ id: 'accepted', scope: 'thumbnail' }),
  });
  const unchecked = observeReprocessDetail(submitted, observed, false);
  expect(unchecked).toBe(submitted);
  expect(reprocessAvailability(unchecked, observed, read)).toMatchObject({
    canSubmit: false,
    canResume: false,
  });
  expect(resumeReprocessState(unchecked, observed, read)).toBe(unchecked);
});

it('does not let the previous task impersonate a lost submission with the same scope', () => {
  const observed = detail({
    processingJob: job({ scope: 'thumbnail', status: 'failed' }),
  });
  const checked = observeReprocessDetail(unknown(), observed, true);
  expect(checked).toMatchObject({ unknown: true, receipt: null });
  expect(reprocessAvailability(checked, observed, read).canResume).toBe(true);
});

it('retains the submitted scope when the currently selected scope changes', () => {
  const submitted = unknown({ scope: 'compressed' });
  const wrong = detail({
    processingJob: job({ id: 'wrong-scope', scope: 'compressed' }),
  });
  const checked = observeReprocessDetail(submitted, wrong, true);
  expect(checked).toMatchObject({
    unknown: true,
    receipt: null,
    scope: 'compressed',
  });
  const matching = detail({
    processingJob: job({
      id: 'accepted',
      scope: 'thumbnail',
      status: 'succeeded',
    }),
  });
  expect(observeReprocessDetail(checked, matching, true)).toMatchObject({
    unknown: false,
    scope: 'compressed',
    receipt: { jobId: 'accepted', scope: 'thumbnail' },
  });
});

it.each(['process', 'metadata', 'image-status'] as const)(
  'does not offer explicit resume while an unrelated %s task is active',
  (active) => {
    const running = job({
      id: 'other',
      scope: 'compressed',
      status: 'running',
    });
    const observed = detail(
      active === 'process'
        ? { processingJob: running }
        : active === 'metadata'
          ? { metadataJob: running }
          : { processingStatus: 'processing' },
    );
    const checked = observeReprocessDetail(unknown(), observed, true);
    expect(reprocessAvailability(checked, observed, read)).toMatchObject({
      canResume: false,
      canSubmit: false,
    });
    expect(resumeReprocessState(checked, observed, read)).toBe(checked);
  },
);

it.each([
  'pending',
  'checking',
  'fetching',
  'query-error',
  'read-error',
] as const)(
  'blocks submission, choices, and explicit recovery during %s',
  (blocked) => {
    const observed = detail();
    const error = new Error('detail unavailable');
    const state = {
      ...observeReprocessDetail(unknown(), observed, true),
      pending: blocked === 'pending',
      checking: blocked === 'checking',
      readError: blocked === 'read-error' ? error : null,
    };
    const query = {
      isFetching: blocked === 'fetching',
      isError: blocked === 'query-error',
      error: blocked === 'query-error' ? error : null,
    };
    const availability = reprocessAvailability(state, observed, query);
    expect(availability).toMatchObject({
      choicesDisabled: true,
      canSubmit: false,
      canResume: false,
    });
    if (blocked === 'read-error' || blocked === 'query-error')
      expect(availability.readError).toBe(error);
    expect(resumeReprocessState(state, observed, query)).toBe(state);
    expect(
      reprocessAvailability({ ...state, unknown: false }, observed, query)
        .canSubmit,
    ).toBe(false);
  },
);

it('requires the currently displayed detail to be the successful check before explicit resume', () => {
  const checkedDetail = detail();
  const state = observeReprocessDetail(unknown(), checkedDetail, true);
  expect(reprocessAvailability(state, detail(), read).canResume).toBe(false);
  expect(reprocessAvailability(state, checkedDetail, read).canResume).toBe(
    true,
  );
});

it('exposes unavailable detail as disabled controls without clearing the unknown receipt state', () => {
  const state = unknown();
  expect(reprocessAvailability(state, undefined, read)).toMatchObject({
    choicesDisabled: true,
    canSubmit: false,
    canResume: false,
  });
  expect(resumeReprocessState(state, undefined, read)).toBe(state);
});

it('keeps a scope-specific server rejection in the common submit guard', () => {
  const observed = detail();
  observed.reprocess.scopes.thumbnail = '缩略图不可用';
  const state = {
    ...initialReprocessState('image'),
    scope: 'thumbnail' as const,
    confirmed: true,
  };
  expect(reprocessAvailability(state, observed, read)).toMatchObject({
    choicesDisabled: false,
    canSubmit: false,
  });
  expect(reprocessView(state, observed)).toEqual({
    kind: 'selection',
    confirmation: 'thumbnail',
  });
});

it('never replaces a known accepted receipt with another observed task', () => {
  const state = {
    ...initialReprocessState('image'),
    receipt: {
      jobId: 'accepted',
      status: 'queued' as const,
      scope: 'thumbnail' as const,
      expectedVersions: ['thumbnail' as const],
    },
  };
  const observed = detail({
    processingJob: job({ id: 'other', scope: 'thumbnail' }),
  });
  const checked = observeReprocessDetail(state, observed, true);
  expect(checked.receipt).toBe(state.receipt);
  expect(receiptJob(observed, state.receipt)).toBeNull();
  expect(receiptJob(undefined, state.receipt)).toBeNull();
  expect(reprocessView(checked, observed)).toMatchObject({
    kind: 'result',
    job: null,
  });
  expect(reprocessAvailability(checked, observed, read).canSubmit).toBe(false);
  expect(resumeReprocessState(checked, observed, read)).toBe(checked);
});

it.each([
  ['all', 'queued', 'all-queued'],
  ['all', 'running', 'result'],
  ['all', 'succeeded', 'result'],
  ['thumbnail', 'queued', 'result'],
  ['thumbnail', 'failed', 'result'],
  ['thumbnail', 'cancelled', 'result'],
] as const)(
  'selects the %s/%s phase using the exact accepted task',
  (scope, status, kind) => {
    const accepted = job({ id: 'accepted', scope, status });
    const observed = detail({ processingJob: accepted });
    const state = {
      ...initialReprocessState('image'),
      receipt: {
        jobId: 'accepted',
        status: 'queued' as const,
        scope,
        expectedVersions: accepted.expectedVersions,
      },
    };
    expect(reprocessView(state, observed)).toMatchObject({
      kind,
      receipt: state.receipt,
      job: accepted,
    });
    expect(receiptJob(observed, state.receipt)).toBe(accepted);
  },
);

it('shows the all-queued receipt until its exact task is available', () => {
  const state = {
    ...initialReprocessState('image'),
    receipt: {
      jobId: 'accepted',
      status: 'queued' as const,
      scope: 'all' as const,
      expectedVersions: ['thumbnail' as const],
    },
  };
  expect(reprocessView(state, detail())).toMatchObject({
    kind: 'all-queued',
    job: null,
  });
});

it('keeps first upload processing distinct from a reprocess receipt and respects dismissed jobs', () => {
  const active = job({ id: 'active', status: 'running' });
  const upload = detail({
    processingStatus: 'processing',
    processingJob: active,
  });
  const initial = initialReprocessState('image');
  expect(observeReprocessDetail(initial, upload, true).receipt).toBeNull();
  const ready = detail({ processingJob: active });
  expect(observeReprocessDetail(initial, ready, true).receipt?.jobId).toBe(
    'active',
  );
  expect(
    observeReprocessDetail(
      initialReprocessState('image', 'active'),
      ready,
      true,
    ).receipt,
  ).toBeNull();
  expect(
    observeReprocessDetail({ ...initial, pending: true }, ready, true).receipt,
  ).toBeNull();
});
