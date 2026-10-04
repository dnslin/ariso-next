import { expect, it } from 'vitest';
import {
  cleanupCommandFor,
  recordCleanupResults,
  retryCleanupRow,
  type TrashBatchRow,
} from '../../../src/components/library/trash-batch-state';
import type { LibraryCleanupTask } from '../../../src/server/library/batch-types';

const cleanup: LibraryCleanupTask = {
  imageId: 'image',
  jobId: 'task',
  status: 'failed',
  waitingForWrites: false,
  cycle: 2,
  error: '权限被拒绝',
  finishedAt: null,
  remaining: [],
  totalObjects: null,
  deletedObjects: null,
  deletedPurposes: null,
};
const row: TrashBatchRow = {
  id: 'image',
  command: { type: 'delete-permanent' },
  state: 'waiting',
};

it('observes an already accepted cleanup task rather than reporting no change as completion', () => {
  const result = {
    id: 'image',
    status: 'unchanged' as const,
    message: '已经受理',
    inQuery: true,
    taskId: 'task',
    cleanup,
  };
  expect(recordCleanupResults([row], [result])[0]).toMatchObject({
    state: 'task',
    result: { cleanup: { status: 'failed', cycle: 2 } },
  });
});

it('starts an explicit retry from the failed cycle and removes its old terminal outcome', () => {
  const taskRow = recordCleanupResults(
    [row],
    [
      {
        id: 'image',
        status: 'accepted',
        taskId: 'task',
        message: '已受理',
        inQuery: true,
        cleanup,
      },
    ],
  )[0];
  const retry = retryCleanupRow(taskRow);
  expect(retry.state).toBe('unsent');
  expect(retry.result).toBeUndefined();
  expect(cleanupCommandFor([retry])).toEqual({
    type: 'retry-cleanup',
    attempts: { image: { taskId: 'task', cycle: 2 } },
  });
  expect(
    recordCleanupResults(
      [retry],
      [
        {
          id: 'image',
          status: 'unknown',
          inQuery: true,
          message: '新周期尚未核实',
        },
      ],
    )[0],
  ).toMatchObject({ state: 'unknown', result: { status: 'unknown' } });
});

it('keeps a missing task unconfirmed and preserves unrelated prior outcomes', () => {
  const other = recordCleanupResults(
    [{ ...row, id: 'other' }],
    [
      {
        id: 'other',
        status: 'accepted',
        taskId: 'task',
        message: '已受理',
        inQuery: true,
        cleanup,
      },
    ],
  )[0];
  const updated = recordCleanupResults(
    [row, other],
    [
      {
        id: 'image',
        status: 'unknown',
        code: 'MEDIA_CLEANUP_NOT_FOUND',
        message: '任务不存在，不能确认删除成功',
        inQuery: false,
      },
    ],
  );
  expect(updated[0].state).toBe('unknown');
  expect(updated[1]).toBe(other);
});

it('replaces a known task with its actual rejection without retaining an old cleanup snapshot', () => {
  const accepted = recordCleanupResults(
    [row],
    [
      {
        id: 'image',
        status: 'accepted',
        taskId: 'task',
        message: '已受理',
        inQuery: true,
        cleanup,
      },
    ],
  );
  const rejection = {
    id: 'image',
    status: 'failed' as const,
    message: '任务身份已变化',
    code: 'MEDIA_CLEANUP_TASK_CONFLICT',
    inQuery: true,
  };
  expect(recordCleanupResults(accepted, [rejection])[0]).toEqual({
    id: 'image',
    command: row.command,
    state: 'rejected',
    result: rejection,
  });
});
