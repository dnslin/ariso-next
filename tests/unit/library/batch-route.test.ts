import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '../../../src/app/api/images/batch/route.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';
import { runLibraryBatch } from '../../../src/server/library/batch.ts';
import { getServerRuntime } from '../../../src/server/startup/server-start.ts';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../../../src/server/identity/owner.ts', () => ({
  requireOwner: vi.fn(),
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: vi.fn(),
}));
vi.mock('../../../src/server/runtime/logger.ts', () => ({
  createRuntimeLogger: () => ({ error: logError }),
}));
vi.mock('../../../src/server/library/batch.ts', async (original) => ({
  ...(await original<typeof import('../../../src/server/library/batch.ts')>()),
  runLibraryBatch: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerRuntime).mockReturnValue({
    connection: { db: {} },
    config: { logLevel: 'debug' },
  } as ReturnType<typeof getServerRuntime>);
});
const valid = {
  ids: ['image'],
  query: '',
  command: { type: 'trash' },
  mode: 'apply',
};
async function post(body = JSON.stringify(valid)) {
  const response = await POST(
    new Request('http://localhost/api/images/batch', { method: 'POST', body }),
  );
  expect(response.headers.get('cache-control')).toBe('no-store');
  return { status: response.status, body: await response.json() };
}
it.each([
  ['UNAUTHORIZED', 401],
  ['INVALID_ORIGIN', 403],
])(
  'requires %s before reading batch input or touching runtime',
  async (code, status) => {
    vi.mocked(requireOwner).mockRejectedValue(
      Object.assign(new Error('Owner required'), { code, status }),
    );
    expect(await post()).toEqual({
      status,
      body: { code, message: 'Owner required' },
    });
    expect(getServerRuntime).not.toHaveBeenCalled();
    expect(runLibraryBatch).not.toHaveBeenCalled();
  },
);
it.each([
  '{',
  JSON.stringify({ ...valid, mode: undefined }),
  JSON.stringify({
    ...valid,
    ids: Array.from({ length: 201 }, (_, i) => `image-${i}`),
  }),
  JSON.stringify({ ...valid, command: { type: 'add-albums', albumIds: [] } }),
])('rejects invalid batch before any image write: %s', async (body) => {
  expect(await post(body)).toMatchObject({
    status: 400,
    body: { code: 'LIBRARY_INVALID_BATCH' },
  });
  expect(runLibraryBatch).not.toHaveBeenCalled();
  expect(getServerRuntime).not.toHaveBeenCalled();
});
it('returns actual per-image mixed results rather than treating HTTP 200 as every item succeeding', async () => {
  const result = {
    results: [
      {
        id: 'changed',
        status: 'changed' as const,
        message: '完成',
        inQuery: false,
      },
      {
        id: 'unchanged',
        status: 'unchanged' as const,
        message: '无变化',
        inQuery: true,
      },
      {
        id: 'failed',
        status: 'failed' as const,
        code: 'INTERNAL_SERVER_ERROR',
        message: '失败',
        inQuery: true,
      },
    ],
  };
  vi.mocked(runLibraryBatch).mockResolvedValue(result);
  expect(await post()).toEqual({ status: 200, body: result });
  expect(runLibraryBatch).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      ids: ['image'],
      filters: expect.objectContaining({ scope: 'normal' }),
      mode: 'apply',
    }),
    expect.any(Function),
  );
});
it('logs each database failure with command, mode and image context, and retains unknown outcomes on a failed response', async () => {
  const error = new Error('injected database failure');
  vi.mocked(runLibraryBatch).mockImplementation(
    async (_db, _input, onFailure) => {
      onFailure(error, 'image');
      throw error;
    },
  );
  expect(await post()).toMatchObject({
    status: 500,
    body: {
      code: 'INTERNAL_SERVER_ERROR',
      message: '批量操作失败，结果待核对',
    },
  });
  expect(logError).toHaveBeenCalledWith(
    { err: error, imageId: 'image', command: 'trash', mode: 'apply', count: 1 },
    'Library batch item failed',
  );
  expect(logError).toHaveBeenCalledWith({ err: error }, 'Library batch failed');
});

it('returns reprocessing acceptance and exact-task uncertainty as independent HTTP 200 item outcomes', async () => {
  const taskId = 'eb3471f8-d191-4bd9-b2ca-20d9f9f43bfe';
  const unknownTaskId = 'cdbcf870-c038-402e-8b23-45014e3ecf6b';
  const task = {
    id: taskId,
    status: 'queued' as const,
    scope: 'all' as const,
    step: 'identify',
    error: null,
    expectedVersions: ['thumbnail' as const],
    generatedVersions: [],
  };
  const result = {
    results: [
      {
        id: 'image',
        status: 'accepted' as const,
        message: '已受理',
        inQuery: true,
        taskId,
        task,
      },
      {
        id: 'unknown',
        status: 'unknown' as const,
        message: '待核对',
        code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
        inQuery: true,
      },
    ],
  };
  vi.mocked(runLibraryBatch).mockResolvedValue(result);
  const command = {
    type: 'reprocess',
    scope: 'all',
    taskIds: { image: taskId, unknown: unknownTaskId },
  };
  expect(
    await post(
      JSON.stringify({
        ...valid,
        ids: ['image', 'unknown'],
        command,
        mode: 'check',
      }),
    ),
  ).toEqual({ status: 200, body: result });
  expect(runLibraryBatch).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ command, mode: 'check' }),
    expect.any(Function),
  );
});

it('returns cleanup acceptance, an already requested task and unconfirmed retry separately', async () => {
  const cleanup = {
    jobId: 'cleanup-task',
    imageId: 'image',
    status: 'queued' as const,
    waitingForWrites: false,
    cycle: 2,
    error: null,
    finishedAt: null,
    totalObjects: 1,
    deletedObjects: 0,
    deletedPurposes: [],
    remaining: [],
  };
  const result = {
    results: [
      {
        id: 'image',
        status: 'accepted' as const,
        taskId: cleanup.jobId,
        cleanup,
        message: '受理',
        inQuery: true,
      },
      {
        id: 'existing',
        status: 'unchanged' as const,
        taskId: cleanup.jobId,
        cleanup: { ...cleanup, imageId: 'existing' },
        code: 'MEDIA_CLEANUP_ALREADY_REQUESTED',
        message: '已有任务',
        inQuery: true,
      },
      {
        id: 'unknown',
        status: 'unknown' as const,
        code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
        message: '待核对',
        inQuery: true,
      },
    ],
  };
  vi.mocked(runLibraryBatch).mockResolvedValue(result);
  const command = {
    type: 'retry-cleanup',
    attempts: Object.fromEntries(
      ['image', 'existing', 'unknown'].map((id) => [
        id,
        { taskId: cleanup.jobId, cycle: 1 },
      ]),
    ),
  };
  expect(
    await post(
      JSON.stringify({
        ...valid,
        ids: ['image', 'existing', 'unknown'],
        query: 'scope=trash',
        command,
        mode: 'check',
      }),
    ),
  ).toEqual({ status: 200, body: result });
  expect(runLibraryBatch).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      command,
      mode: 'check',
      filters: expect.objectContaining({ scope: 'trash' }),
    }),
    expect.any(Function),
  );
});
