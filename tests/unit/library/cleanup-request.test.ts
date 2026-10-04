import { expect, it, vi, afterEach } from 'vitest';
import {
  cleanupAttemptConfirmed,
  CleanupRequestError,
  requestCleanup,
} from '../../../src/components/library/cleanup-request';
import type { LibraryCleanupTask } from '../../../src/server/library/batch-types';

afterEach(() => vi.unstubAllGlobals());
it('keeps a failed retry unresolved until a newer cycle of the frozen job is observed', () => {
  const task = {
    jobId: 'job',
    cycle: 3,
    status: 'failed',
  } as LibraryCleanupTask;
  expect(cleanupAttemptConfirmed(task, { jobId: 'job', cycle: 3 })).toBe(false);
  expect(
    cleanupAttemptConfirmed({ ...task, cycle: 4 }, { jobId: 'job', cycle: 3 }),
  ).toBe(true);
  expect(
    cleanupAttemptConfirmed(
      { ...task, jobId: 'other', cycle: 4 },
      { jobId: 'job', cycle: 3 },
    ),
  ).toBe(false);
  expect(
    cleanupAttemptConfirmed({ ...task, cycle: 5 }, { jobId: 'job', cycle: 3 }),
  ).toBe(false);
  expect(cleanupAttemptConfirmed(task, null)).toBe(true);
});
it.each([
  ['read', '/api/images/image%20id/cleanup', 'GET'],
  ['delete', '/api/images/image%20id', 'DELETE'],
  ['retry', '/api/images/image%20id/cleanup/retry', 'POST'],
] as const)(
  'uses the existing media endpoint for %s',
  async (operation, url, method) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ jobId: 'job', status: 'queued' }, { status: 202 }),
      );
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(
      await requestCleanup('image id', operation, controller.signal),
    ).toMatchObject({ jobId: 'job' });
    expect(fetch).toHaveBeenCalledWith(url, {
      method,
      cache: 'no-store',
      signal: controller.signal,
    });
  },
);
it('preserves actual HTTP errors and never considers missing cleanup a successful delete', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { code: 'MEDIA_CLEANUP_NOT_FOUND', message: '永久删除任务不存在' },
          { status: 404 },
        ),
      ),
  );
  await expect(
    requestCleanup('image', 'read', new AbortController().signal),
  ).rejects.toEqual(
    new CleanupRequestError(
      'MEDIA_CLEANUP_NOT_FOUND: 永久删除任务不存在（HTTP 404）',
      404,
    ),
  );
});
