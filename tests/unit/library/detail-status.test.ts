import { afterEach, expect, it, vi } from 'vitest';
import {
  detailStatusChanged,
  hasActiveDetailTask,
  readDetailStatus,
} from '../../../src/components/library/read-detail-status';
import type { LibraryDetail } from '../../../src/server/library/detail-types';
import type {
  LibraryItem,
  LibraryProcessingJob,
} from '../../../src/server/library/types';

afterEach(() => vi.unstubAllGlobals());

it('uses the bounded status endpoint for the active detail rather than rereading content', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ items: [], missingIds: ['image'] }));
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await readDetailStatus('image', signal)).toEqual({
    items: [],
    missingIds: ['image'],
  });
  expect(fetcher).toHaveBeenCalledWith(
    '/api/images/status',
    expect.objectContaining({
      method: 'POST',
      body: '{"ids":["image"]}',
      signal,
    }),
  );
});

it('retains unauthorized status for session expiry instead of returning stale success', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '登录已失效' }, { status: 401 }),
      ),
  );
  await expect(
    readDetailStatus('image', new AbortController().signal),
  ).rejects.toMatchObject({ status: 401, message: '登录已失效（HTTP 401）' });
});

const job = {
  id: 'job',
  status: 'queued',
  scope: 'all',
  step: 'identify',
  error: null,
} as const;
const current = {
  processingStatus: 'ready',
  trashedAt: null,
  deletionStatus: null,
  storage: { enabled: true },
  activeJob: job,
  latestFailedJob: null,
  metadataJob: null,
  processingJob: null,
  versions: [{ kind: 'original', saved: true }],
} as LibraryDetail;
const status = {
  ...current,
  versions: { original: true },
} as unknown as LibraryItem;

it('refreshes actual detail only after observable task, lifecycle or version changes', () => {
  expect(detailStatusChanged(current, status)).toBe(false);
  expect(detailStatusChanged(current, { ...status, activeJob: null })).toBe(
    true,
  );
  expect(
    detailStatusChanged(current, {
      ...status,
      activeJob: { ...job, status: 'running', step: 'thumbnail' },
    }),
  ).toBe(true);
  expect(
    detailStatusChanged(current, {
      ...status,
      storage: { ...status.storage, enabled: false },
    }),
  ).toBe(true);
  expect(detailStatusChanged(current, undefined)).toBe(true);
});

it('keeps polling independent metadata tasks and stops at their actual terminal status', () => {
  const metadata = {
    id: 'metadata',
    status: 'queued' as const,
    step: 'metadata',
    error: null,
  };
  expect(hasActiveDetailTask({ activeJob: null, metadataJob: metadata })).toBe(
    true,
  );
  expect(
    hasActiveDetailTask({
      activeJob: null,
      metadataJob: { ...metadata, status: 'running' },
    }),
  ).toBe(true);
  for (const terminal of ['succeeded', 'failed', 'cancelled'] as const) {
    const item = {
      ...status,
      activeJob: null,
      metadataJob: { ...metadata, status: terminal },
    };
    expect(hasActiveDetailTask(item)).toBe(false);
    expect(
      detailStatusChanged(
        { ...current, activeJob: null, metadataJob: metadata },
        item,
      ),
    ).toBe(true);
  }
});

it('refreshes on actual accepted process outcomes even when existing image remains ready', () => {
  const processingJob: LibraryProcessingJob = {
    ...job,
    expectedVersions: ['thumbnail'],
    generatedVersions: [],
  };
  const accepted = {
    ...current,
    processingJob: { ...processingJob, expectedVersions: ['thumbnail'] },
  } as LibraryDetail;
  const completed = {
    ...status,
    activeJob: null,
    processingJob: {
      ...processingJob,
      status: 'succeeded',
      expectedVersions: ['thumbnail'],
    },
  } as LibraryItem;
  expect(detailStatusChanged(accepted, completed)).toBe(true);
  expect(
    detailStatusChanged(
      { ...accepted, activeJob: null, processingJob: completed.processingJob },
      completed,
    ),
  ).toBe(false);
});

it('refreshes when a candidate is stored without a processing step change', () => {
  const processingJob: LibraryProcessingJob = {
    ...job,
    expectedVersions: ['thumbnail'],
    generatedVersions: [],
  };
  const detail = { ...current, processingJob } as LibraryDetail;
  const candidate = {
    ...status,
    processingJob: { ...processingJob, generatedVersions: ['thumbnail'] },
  } as LibraryItem;
  expect(detailStatusChanged(detail, candidate)).toBe(true);
});
