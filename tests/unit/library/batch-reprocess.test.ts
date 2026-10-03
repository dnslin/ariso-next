import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  BatchReprocessContent,
  BatchReprocessFooter,
} from '../../../src/components/library/batch-reprocess';
import {
  failedTaskIds,
  type ReprocessRow,
  type ReprocessAccepted,
  type ReprocessRejected,
} from '../../../src/components/library/batch-reprocess-state';
import type { BatchReprocess } from '../../../src/components/library/use-batch-reprocess';
import type { LibraryProcessingJob } from '../../../src/server/library/types';

vi.mock('@heroui/react/modal', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Modal: Object.assign(pass, {
      Backdrop: pass,
      Container: pass,
      Dialog: pass,
      Header: pass,
      Heading: ({ children }: { children: ReactNode }) =>
        createElement('h2', null, children),
      Body: pass,
      Footer: pass,
    }),
  };
});
const taskLabels = {
  queued: '排队中',
  running: '正在处理',
  succeeded: '处理完成',
  failed: '处理失败',
  cancelled: '任务已取消',
};
function rowFor(
  response: ReprocessAccepted | ReprocessRejected,
  scope: ReprocessRow['attempt']['scope'] = 'all',
): ReprocessRow {
  return {
    id: response.id,
    attempt: {
      taskId: response.status === 'accepted' ? response.taskId : 'task-first',
      scope,
    },
    outcome:
      response.status === 'accepted'
        ? { state: 'accepted', result: response }
        : { state: 'rejected', result: response },
  };
}
function state(): BatchReprocess {
  return {
    workspace: {
      action: 'reprocess',
      items: [
        {
          id: 'first',
          displayName: '首次失败.png',
          processingStatus: 'failed',
          thumbnailUrl: null,
          storage: { id: 'local', name: '本地', enabled: true },
          source: '第2页',
          inCurrentPage: false,
        },
      ],
      currentCount: 0,
      query: 'scope=normal',
      scope: 'all',
      rows: [],
      message: '',
      phase: 'choose',
    },
    returnLabel: '返回图库',
    showFailures: false,
    toggleFailures: vi.fn(),
    visible: true,
    pending: false,
    open: vi.fn(),
    close: vi.fn(),
    get unresolved() {
      return this.unknownIds.length > 0;
    },
    get unknownIds() {
      return (
        this.workspace?.rows
          .filter((row) => row.outcome.state === 'unknown')
          .map((row) => row.id) ?? []
      );
    },
    get unsentIds() {
      return (
        this.workspace?.rows
          .filter((row) => row.outcome.state === 'unsent')
          .map((row) => row.id) ?? []
      );
    },
    reopen: vi.fn(),
    choose: vi.fn(),
    submit: vi.fn(),
    check: vi.fn(),
    retry: vi.fn(),
    retryFailures: vi.fn(),
    failedIds: [],
    refreshPending: false,
    refreshError: '',
    retryRefresh: vi.fn(),
    progressError: '',
    checkProgress: vi.fn(),
    retryTasks: vi.fn(),
    retryFailuresAll: vi.fn(),
  };
}
function result(batch: BatchReprocess, status: LibraryProcessingJob['status']) {
  batch.workspace!.phase = 'result';
  const response: ReprocessAccepted = {
    id: 'first',
    status: 'accepted',
    taskId: 'task-first',
    inQuery: true,
    message: '任务已受理',
    task: {
      id: 'task-first',
      status,
      scope: 'all',
      step: 'thumbnail',
      error: status === 'failed' ? '磁盘不可写' : null,
      expectedVersions: ['thumbnail'],
      generatedVersions: [],
    },
  };
  batch.workspace!.rows = [rowFor(response)];
}
const render = (batch: BatchReprocess) =>
  renderToStaticMarkup(createElement(BatchReprocessContent, { batch }));
const footer = (batch: BatchReprocess) =>
  renderToStaticMarkup(createElement(BatchReprocessFooter, { batch }));

it('shows all four scopes while disabling partial work for failed-only selection', () => {
  const html = render(state());
  expect(html).toContain('其他页 1 张');
  for (const scope of ['compressed', 'thumbnail', 'watermark']) {
    const control = html.match(
      new RegExp(
        `<[^>]*data-testid="batch-reprocess-scope-${scope}"[\\s\\S]*?<input[^>]*>`,
      ),
    )?.[0];
    expect(control).toBeDefined();
    expect(control?.match(/<input[^>]*>/)?.[0]).toMatch(/\sdisabled(?:=|\s|>)/);
  }
  expect(html).toContain('开始处理 · 1张');
  expect(html.match(/首次处理失败，仅支持全部派生。/g)).toHaveLength(1);
  expect(html).toContain('aria-label="查看处理说明"');
  expect(html).not.toContain('每张图片受理时使用最新设置');
});

it('allows partial ranges in mixed ready and failed selection without silently changing failed scope', () => {
  const batch = state();
  batch.workspace!.items.push({
    ...batch.workspace!.items[0],
    id: 'ready',
    displayName: '可用.png',
    processingStatus: 'ready',
  });
  const html = render(batch);
  const control = html.match(
    /<[^>]*data-testid="batch-reprocess-scope-watermark"[\s\S]*?<input[^>]*>/,
  )?.[0];
  expect(control).toBeDefined();
  expect(control?.match(/<input[^>]*>/)?.[0]).not.toMatch(
    /\sdisabled(?:=|\s|>)/,
  );
  expect(html).toContain(
    '1 张首次处理失败的图片仅支持全部派生；选择局部范围会显示冲突。',
  );
});

it.each(['queued', 'running'] as const)(
  'renders %s as accepted work with exact task identity rather than completion',
  (status) => {
    const batch = state();
    result(batch, status);
    const html = render(batch);
    expect(html).toContain('任务已受理');
    expect(html).toContain('data-task-id="task-first"');
    expect(html).toContain(`data-job-status="${status}"`);
    expect(html).not.toContain('重新处理完成');
    expect(footer(batch)).not.toContain('batch-task-retry');
  },
);

it('retains exact task state on progress read error and offers a read retry', () => {
  const batch = state();
  result(batch, 'running');
  batch.progressError = '连接中断';
  const html = render(batch);
  expect(html).toContain('读取进度失败');
  expect(html).toContain('保留最后已知任务状态');
  expect(html).toContain('data-testid="batch-progress-check"');
  expect(html).toContain('data-task-id="task-first"');
});

it('keeps unconfirmed outcomes separate from rejected and execution failures and only offers a check', () => {
  const batch = state();
  result(batch, 'failed');
  batch.workspace!.rows[0].outcome = { state: 'unknown' };
  const html = footer(batch);
  expect(html).toContain('data-testid="batch-check"');
  expect(html).not.toContain('data-testid="batch-retry"');
  expect(html).not.toContain('data-testid="batch-task-retry"');
  expect(render(batch)).toContain('结果待核对');
});

it('offers explicit execution failure retry without requiring or claiming a retained selection', () => {
  const batch = state();
  result(batch, 'failed');
  batch.showFailures = true;
  expect(render(batch)).toContain('磁盘不可写');
  expect(render(batch)).toContain('已受理时移出选择');
  expect(footer(batch)).toContain('data-testid="batch-task-retry"');
  expect(footer(batch)).not.toContain('data-testid="batch-retry"');
  (
    batch.workspace!.rows[0].outcome as {
      state: 'accepted';
      result: ReprocessAccepted;
    }
  ).result.inQuery = false;
  expect(footer(batch)).not.toContain('data-testid="batch-task-retry"');
});

it('offers an explicitly broader all-derived retry for retained partial-scope rejection', () => {
  const batch = state();
  batch.workspace!.phase = 'result';
  batch.showFailures = true;
  batch.failedIds = ['first'];
  batch.workspace!.scope = 'watermark';
  batch.workspace!.rows = [
    rowFor(
      {
        id: 'first',
        status: 'failed',
        inQuery: true,
        message: '首次失败仅允许全部派生',
      },
      'watermark',
    ),
  ];
  expect(footer(batch)).toContain('data-testid="batch-retry-all"');
  expect(footer(batch)).toContain('全部派生重试未受理项');
  expect(footer(batch)).not.toContain('data-testid="batch-task-retry"');
  batch.workspace!.rows.push({
    id: 'not-sent',
    attempt: { taskId: 'task-unsent', scope: 'all' },
    outcome: { state: 'unsent' },
  });
  const blocked = footer(batch);
  expect(blocked).toMatch(
    /<button[^>]*data-testid="batch-retry-all"[^>]*disabled/,
  );
  expect(blocked).toContain('请先按原范围继续处理剩余项');
});

it.each(['failed', 'cancelled', 'succeeded'] as const)(
  'labels the real task terminal status %s',
  (status) => {
    const batch = state();
    result(batch, status);
    expect(render(batch)).toContain(taskLabels[status]);
    expect(render(batch)).not.toContain('1 张处理中');
    if (status === 'succeeded')
      expect(render(batch)).toContain('已更新：缩略图');
  },
);

it('preserves each execution failure scope after an explicit all-derived retry of initial conflicts', () => {
  const batch = state();
  result(batch, 'failed');
  batch.showFailures = true;
  const first = batch.workspace!.rows[0];
  first.attempt = { ...first.attempt, scope: 'watermark' };
  const firstResult = (
    first.outcome as { state: 'accepted'; result: ReprocessAccepted }
  ).result;
  firstResult.task.scope = 'watermark';
  batch.workspace!.items.push({ ...batch.workspace!.items[0], id: 'second' });
  batch.workspace!.rows.push(
    rowFor({
      ...firstResult,
      id: 'second',
      taskId: 'task-second',
      task: { ...firstResult.task, id: 'task-second', scope: 'all' },
    }),
  );
  expect(batch.workspace!.scope).toBe('all');
  expect(failedTaskIds(batch.workspace!.rows, 'watermark')).toEqual(['first']);
  expect(failedTaskIds(batch.workspace!.rows, 'all')).toEqual(['second']);
  const html = footer(batch);
  expect(html).toContain('data-retry-scope="watermark"');
  expect(html).toContain('data-retry-scope="all"');
  expect(html).toContain('重试水印失败 · 1张');
  expect(html).toContain('重试全部派生失败 · 1张');
  batch.workspace!.rows.push({
    id: 'not-sent',
    attempt: { taskId: 'task-unsent', scope: 'all' },
    outcome: { state: 'unsent' },
  });
  const blocked = footer(batch);
  expect(blocked).toMatch(
    /<button[^>]*data-retry-scope="watermark"[^>]*disabled/,
  );
  expect(blocked).not.toMatch(
    /<button[^>]*data-retry-scope="all"[^>]*disabled/,
  );
});

it.each([
  ['queued', 'default'],
  ['running', 'accent'],
  ['succeeded', 'success'],
  ['failed', 'danger'],
  ['cancelled', 'danger'],
] as const)(
  'uses text and a semantic chip for the real task state %s',
  (status, color) => {
    const batch = state();
    result(batch, status);
    const html = render(batch);
    const chip = html.match(
      /<span[^>]*data-testid="batch-task-status"[^>]*>/,
    )?.[0];
    expect(chip).toContain(`data-state="${status}"`);
    expect(chip).toContain(`chip--${color}`);
    expect(html).toContain(taskLabels[status]);
    expect(html).not.toMatch(/(?:处理中|完成|未受理|处理失败) 0 张/);
    expect(html).toContain('共 1 张');
    expect(html).toContain('aria-label="查看处理说明"');
    expect(html).not.toContain('任务受理不等于处理完成');
  },
);

it('distinguishes unaccepted, unknown and unsent status chips while retaining their reasons', () => {
  const batch = state();
  batch.workspace!.phase = 'result';
  batch.workspace!.rows = [
    rowFor({
      id: 'first',
      status: 'failed',
      inQuery: true,
      message: '首次失败仅允许全部派生',
    }),
  ];
  let html = render(batch);
  const chip = html.match(
    /<span[^>]*data-testid="batch-task-status"[^>]*>/,
  )?.[0];
  expect(chip).toContain('chip--warning');
  expect(chip).toContain('data-state="rejected"');
  expect(html).not.toContain('任务已受理 0 张');
  expect(html).toContain('未受理');
  expect(html).toContain('首次失败仅允许全部派生');
  batch.workspace!.rows[0].outcome = { state: 'unknown' };
  html = render(batch);
  expect(html).toContain('data-state="unknown"');
  expect(html).toContain('结果待核对');
  batch.workspace!.rows[0].outcome = { state: 'unsent' };
  html = render(batch);
  expect(html).toContain('data-state="unsent"');
  expect(html).toContain('尚未提交');
});

it('shows terminal list refresh errors separately with an actual list retry action', () => {
  const batch = state();
  result(batch, 'succeeded');
  batch.refreshError = '列表连接中断';
  const html = render(batch);
  expect(html).toContain('列表刷新失败');
  expect(html).toContain('列表连接中断');
  expect(html).toMatch(/<div[^>]*role="alert"/);
  expect(html).toContain('data-testid="batch-refresh-retry"');
  expect(html).toContain('重新刷新列表');
  expect(html).toContain('data-job-status="succeeded"');
  expect(html).not.toContain('读取进度失败');
  expect(html).not.toContain('batch-progress-check');
});

it('counts cancelled and failed jobs together while keeping their row labels distinct', () => {
  const batch = state();
  result(batch, 'failed');
  const first = (
    batch.workspace!.rows[0].outcome as {
      state: 'accepted';
      result: ReprocessAccepted;
    }
  ).result;
  batch.workspace!.items.push({ ...batch.workspace!.items[0], id: 'second' });
  batch.workspace!.rows.push(
    rowFor({
      ...first,
      id: 'second',
      taskId: 'task-second',
      task: { ...first.task, id: 'task-second', status: 'cancelled' },
    }),
  );
  const html = render(batch);
  expect(html).toContain('处理失败 2 张');
  expect(html).toContain('任务已取消');
  expect(html).toContain('data-state="failed"');
  expect(html).toContain('data-state="cancelled"');
});

it('hides retained unknown work until the user explicitly reopens it', () => {
  const batch = state();
  result(batch, 'running');
  batch.workspace!.rows[0].outcome = { state: 'unknown' };
  batch.visible = false;
  expect(render(batch)).toBe('');
  batch.visible = true;
  expect(render(batch)).toContain('结果待核对');
});

it('preserves the warning color for waiting acceptance separately from neutral queued tasks', () => {
  const batch = state();
  result(batch, 'queued');
  batch.pending = true;
  batch.workspace!.rows[0].outcome = { state: 'waiting' };
  const html = render(batch);
  const chip = html.match(
    /<span[^>]*data-testid="batch-task-status"[^>]*>/,
  )?.[0];
  expect(chip).toContain('data-state="waiting"');
  expect(chip).toContain('chip--warning');
  expect(html).toContain('等待受理');
  expect(html).not.toContain('尚未提交');
  expect(html).not.toContain('任务已受理');
});
