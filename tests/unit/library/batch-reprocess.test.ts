import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  BatchReprocessContent,
  BatchReprocessFooter,
  batchTaskStatus,
} from '../../../src/components/library/batch-reprocess';
import { batchFailedTaskIds } from '../../../src/components/library/use-library-batch';
import type { LibraryBatch } from '../../../src/components/library/use-library-batch';
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
function state(): LibraryBatch {
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
      command: {
        type: 'reprocess',
        scope: 'all',
        taskIds: { first: 'task-first' },
      },
      results: [],
      unknownIds: [],
      unsentIds: [],
      message: '',
      checkFailed: false,
      retrying: false,
      phase: 'choose',
    },
    returnLabel: '返回图库',
    targetReady: true,
    setTargetReady: vi.fn(),
    showFailures: false,
    toggleFailures: vi.fn(),
    visible: true,
    pending: false,
    open: vi.fn(),
    close: vi.fn(),
    unresolved: false,
    reopen: vi.fn(),
    onExpire: vi.fn(),
    choose: vi.fn(),
    submit: vi.fn(),
    check: vi.fn(),
    retry: vi.fn(),
    retryFailures: vi.fn(),
    failedIds: [],
    progressError: '',
    checkProgress: vi.fn(),
    retryTasks: vi.fn(),
    retryFailuresAll: vi.fn(),
  };
}
function result(batch: LibraryBatch, status: LibraryProcessingJob['status']) {
  batch.workspace!.phase = 'result';
  batch.workspace!.results = [
    {
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
    },
  ];
}
const render = (batch: LibraryBatch) =>
  renderToStaticMarkup(createElement(BatchReprocessContent, { batch }));
const footer = (batch: LibraryBatch) =>
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
  expect(html).toContain('开始全部派生重处理');
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
  expect(html).toContain('不会自动扩大范围');
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
  batch.unresolved = true;
  batch.workspace!.unknownIds = ['first'];
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
  batch.workspace!.results[0].inQuery = false;
  expect(footer(batch)).not.toContain('data-testid="batch-task-retry"');
});

it('offers an explicitly broader all-derived retry for retained partial-scope rejection', () => {
  const batch = state();
  batch.workspace!.phase = 'result';
  batch.showFailures = true;
  batch.failedIds = ['first'];
  batch.workspace!.command = {
    type: 'reprocess',
    scope: 'watermark',
    taskIds: { first: 'task-first' },
  };
  batch.workspace!.results = [
    {
      id: 'first',
      status: 'failed',
      inQuery: true,
      message: '首次失败仅允许全部派生',
    },
  ];
  expect(footer(batch)).toContain('data-testid="batch-retry-all"');
  expect(footer(batch)).toContain('全部派生重试未受理项');
  expect(footer(batch)).not.toContain('data-testid="batch-task-retry"');
  batch.workspace!.unsentIds = ['not-sent'];
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
    expect(render(batch)).toContain(
      batchTaskStatus(batch.workspace!.results[0]),
    );
    expect(render(batch)).not.toContain('1 张处理中');
    if (status === 'succeeded')
      expect(render(batch)).toContain('已更新：缩略图');
  },
);

it('preserves each execution failure scope after an explicit all-derived retry of initial conflicts', () => {
  const batch = state();
  result(batch, 'failed');
  batch.showFailures = true;
  batch.workspace!.results[0].task!.scope = 'watermark';
  batch.workspace!.items.push({ ...batch.workspace!.items[0], id: 'second' });
  batch.workspace!.results.push({
    ...batch.workspace!.results[0],
    id: 'second',
    status: 'accepted',
    taskId: 'task-second',
    task: {
      ...batch.workspace!.results[0].task!,
      id: 'task-second',
      scope: 'all',
    },
  });
  // The global command now records the last explicit all-derived retry.
  expect(batch.workspace!.command).toMatchObject({ scope: 'all' });
  expect(batchFailedTaskIds(batch.workspace!.results, 'watermark')).toEqual([
    'first',
  ]);
  expect(batchFailedTaskIds(batch.workspace!.results, 'all')).toEqual([
    'second',
  ]);
  const html = footer(batch);
  expect(html).toContain('data-retry-scope="watermark"');
  expect(html).toContain('data-retry-scope="all"');
  expect(html).toContain('重试水印失败 · 1张');
  expect(html).toContain('重试全部派生失败 · 1张');
  batch.workspace!.unsentIds = ['not-sent'];
  const blocked = footer(batch);
  expect(blocked).toMatch(
    /<button[^>]*data-retry-scope="watermark"[^>]*disabled/,
  );
  expect(blocked).not.toMatch(
    /<button[^>]*data-retry-scope="all"[^>]*disabled/,
  );
});
