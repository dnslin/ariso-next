import { createElement, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  BatchWorkspaceContent,
  BatchWorkspaceFooter,
} from '../../../src/components/library/batch-workspace';
import {
  BatchSummary,
  BatchSummaryFooter,
} from '../../../src/components/library/batch-summary';
import type {
  BatchSnapshotItem,
  LibraryBatch,
} from '../../../src/components/library/use-library-batch';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Portals have no server markup. Keep the real exported result component visible
// while leaving its buttons and their disabled behavior to HeroUI.
vi.mock('@heroui/react/modal', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Modal: Object.assign(pass, {
      Backdrop: pass,
      Container: pass,
      Dialog: ({ children, ...props }: { children: ReactNode }) =>
        createElement('div', { ...props, role: 'dialog' }, children),
      Header: pass,
      Heading: ({ children }: { children: ReactNode }) =>
        createElement('h2', null, children),
      Body: pass,
      Footer: pass,
    }),
  };
});

const item = (id: string): BatchSnapshotItem => ({
  id,
  displayName: `${id}.png`,
  thumbnailUrl: `/i/${id}?type=thumbnail`,
  storage: { id: 'local', name: '测试存储', enabled: true },
  source: '第2页',
  inCurrentPage: true,
  byteSize: 2516582,
});
function state(overrides: Partial<LibraryBatch> = {}): LibraryBatch {
  return {
    workspace: {
      action: 'public',
      items: [item('first')],
      currentCount: 1,
      query: '',
      command: { type: 'visibility', visibility: 'public' },
      results: [
        { id: 'first', status: 'changed', message: '已公开', inQuery: true },
      ],
      unknownIds: [],
      unsentIds: [],
      message: '',
      checkFailed: false,
      retrying: false,
      phase: 'result',
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
    ...overrides,
  };
}
const render = (batch: LibraryBatch) =>
  renderToStaticMarkup(createElement(BatchSummary, { batch }));

it('keeps an enabled continue action after checking 200 successful items with one item still unsubmitted', () => {
  const batch = state();
  const items = Array.from({ length: 201 }, (_, index) =>
    item(`image-${index}`),
  );
  batch.workspace = {
    ...batch.workspace!,
    items,
    results: items.slice(0, 200).map(({ id }) => ({
      id,
      status: 'unchanged',
      message: '核对成功，当前已是目标状态',
      inQuery: true,
    })),
    unsentIds: ['image-200'],
  };
  const html = render(batch);
  expect(html).toContain('本次操作尚未完成');
  const button = html.match(
    /<button[^>]*data-testid="batch-retry"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  expect(button).toBeDefined();
  expect(button).toContain('继续处理剩余项 · 1张');
  expect(button).not.toContain('disabled');
  expect(html).not.toContain('失败项 ·');
});

it('uses the valid failed thumbnail instead of a successful recycled image whose content URL has closed', () => {
  const batch = state({ failedIds: ['failed'] });
  batch.workspace = {
    ...batch.workspace!,
    action: 'trash',
    command: { type: 'trash' },
    items: [item('recycled'), item('failed')],
    results: [
      { id: 'recycled', status: 'changed', message: '已回收', inQuery: false },
      { id: 'failed', status: 'failed', message: '目标不可用', inQuery: true },
    ],
  };
  const html = render(batch);
  expect(html).toContain('src="/i/failed?type=thumbnail"');
  expect(html).not.toContain('src="/i/recycled?type=thumbnail"');
  expect(html).toContain('1张失败项保留选择');
  expect(html).toContain('原图 · 2.4 MiB');
});

it('shows failed names, IDs, source pages and real reasons without retaining invalid failures in selection', () => {
  const batch = state({ showFailures: true });
  batch.workspace!.results = [
    { id: 'first', status: 'failed', message: '图片已被删除', inQuery: false },
  ];
  const html = render(batch);
  expect(html).toContain('first.png');
  expect(html).toContain('first</p>');
  expect(html).toContain('第2页');
  expect(html).toContain('图片已被删除');
  expect(html).toContain('已删除或离开本次查询，已移除选择');
  expect(html).not.toContain('data-testid="batch-retry"');
});

it('disables remaining-item submission during another active request', () => {
  const batch = state({ pending: true });
  batch.workspace!.unsentIds = ['first'];
  batch.workspace!.results = [];
  const html = render(batch);
  expect(
    html.match(/<button[^>]*data-testid="batch-retry"[^>]*>/)?.[0],
  ).toContain('disabled');
  const footer = renderToStaticMarkup(
    createElement(BatchSummaryFooter, { batch }),
  );
  expect(
    footer.match(/<button[^>]*data-testid="batch-done"[^>]*>/)?.[0],
  ).toContain('disabled');
});

it('requires viewing retained relation failures before offering a write retry', () => {
  const batch = state({ failedIds: ['first'] });
  batch.workspace = {
    ...batch.workspace!,
    action: 'add-albums',
    command: { type: 'add-albums', albumIds: ['album'] },
    results: [
      { id: 'first', status: 'failed', message: '暂时写入失败', inQuery: true },
    ],
  };
  const overview = renderToStaticMarkup(
    createElement(BatchWorkspaceFooter, { batch }),
  );
  expect(overview).toContain('data-testid="batch-retained"');
  expect(overview).toContain('查看保留的1张');
  expect(overview).not.toContain('data-testid="batch-retry"');
  const retained = renderToStaticMarkup(
    createElement(BatchWorkspaceFooter, {
      batch: { ...batch, showFailures: true },
    }),
  );
  expect(retained).toContain('data-testid="batch-retry"');
  expect(retained).toContain('重试添加到相册');
});

it('keeps return to the library enabled even if the retained failure list is now empty', () => {
  const html = renderToStaticMarkup(
    createElement(BatchSummaryFooter, { batch: state({ showFailures: true }) }),
  );
  const button = html.match(
    /<button[^>]*data-testid="batch-done"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  expect(button).toContain('返回图库');
  expect(button).not.toContain('disabled');
});

it('shows a failed retry as still selected and returns to its read-only retained list', () => {
  const batch = state({ failedIds: ['first'] });
  batch.workspace = {
    ...batch.workspace!,
    action: 'add-albums',
    command: { type: 'add-albums', albumIds: ['album'] },
    retrying: true,
    results: [
      { id: 'first', status: 'failed', message: '再次写入失败', inQuery: true },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(BatchWorkspaceContent, { batch, client: new QueryClient() }),
  );
  expect(html).toContain('重试后仍有1张失败');
  expect(html).toContain('原操作：添加到相册');
  expect(html).not.toContain('本次操作：原操作：');
  const row = html.match(
    /<li[^>]*data-batch-result-id="first"[^>]*>[\s\S]*?<\/li>/,
  )?.[0];
  const rowOpening = row?.match(/^<li[^>]*>/)?.[0];
  expect(rowOpening).toContain('bg-default');
  expect(row).toContain('lucide-check');
  const footer = renderToStaticMarkup(
    createElement(BatchWorkspaceFooter, { batch }),
  );
  expect(footer).toContain('返回已选1张');
  expect(footer).toContain('data-testid="batch-retained"');
  expect(footer).not.toContain('data-testid="batch-retry"');
});

it.each(['public', 'private'] as const)(
  'shows %s retained failures as a separate page with valid page counts and the original retry command',
  (action) => {
    const batch = state({ showFailures: true, failedIds: ['first', 'other'] });
    const first = Object.assign(item('first'), { inCurrentPage: true });
    const other = Object.assign(item('other'), {
      inCurrentPage: false,
      source: '第1页',
    });
    batch.workspace = {
      ...batch.workspace!,
      action,
      command: { type: 'visibility', visibility: action },
      items: [item('success'), first, other, item('removed')],
      currentCount: 3,
      results: [
        { id: 'success', status: 'changed', message: '已保存', inQuery: true },
        { id: 'first', status: 'failed', message: '写入失败', inQuery: true },
        {
          id: 'other',
          status: 'failed',
          message: '暂时不可写入',
          inQuery: true,
        },
        {
          id: 'removed',
          status: 'failed',
          message: '图片已被删除',
          inQuery: false,
        },
      ],
    };
    const html = render(batch);
    expect(html).toContain('保留2张失败项');
    expect(html).toContain('当前页1张 · 其他页1张');
    expect(html).toContain('仅重试这2张，已成功项目不会再次提交。');
    expect(html).toContain('src="/i/first?type=thumbnail"');
    expect(html).toContain('图片已被删除');
    expect(html).toContain('已删除或离开本次查询，已移除选择');
    expect(html).not.toContain('data-testid="batch-result-summary"');
    expect(html).not.toContain('data-batch-result-id="success"');
    const footer = renderToStaticMarkup(
      createElement(BatchSummaryFooter, { batch }),
    );
    expect(footer).toContain(
      `重试设为${action === 'public' ? '公开' : '私有'}`,
    );
    expect(footer).toContain('button--outline');
    expect(footer).toContain('data-testid="batch-retry"');
    expect(footer).not.toContain('查看失败项');
  },
);

it('keeps invalid failure reasons visible while disabling failure-only retry', () => {
  const batch = state({ showFailures: true });
  batch.workspace!.results = [
    { id: 'first', status: 'failed', message: '图片已被删除', inQuery: false },
  ];
  const html = render(batch);
  expect(html).toContain('保留0张失败项');
  expect(html).toContain('图片已被删除');
  const footer = renderToStaticMarkup(
    createElement(BatchSummaryFooter, { batch }),
  );
  expect(
    footer.match(/<button[^>]*data-testid="batch-retry"[^>]*>/)?.[0],
  ).toContain('disabled');
});

it.each(['public', 'private'] as const)(
  'never renders a separate success dialog after %s failure-only retry',
  (action) => {
    const batch = state();
    batch.workspace = {
      ...batch.workspace!,
      action,
      command: { type: 'visibility', visibility: action },
      items: [item('first'), item('other')],
      retrying: true,
      results: [
        { id: 'first', status: 'changed', message: '已保存', inQuery: true },
        {
          id: 'other',
          status: 'unchanged',
          message: '核对成功',
          inQuery: true,
        },
      ],
    };
    expect(render(batch)).not.toContain('role="dialog"');
    expect(render(batch)).not.toContain('失败项重试成功');
  },
);

it.each([false, true])(
  'does not add a success dialog for initial or continued visibility work (retrying=%s)',
  (retrying) => {
    const batch = state();
    batch.workspace!.retrying = retrying;
    const html = render(batch);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('失败项重试成功');
  },
);

it('keeps a completed failure retry in summary when unsubmitted selected items remain', () => {
  const batch = state();
  batch.workspace = {
    ...batch.workspace!,
    retrying: true,
    items: [item('first'), item('remaining')],
    unsentIds: ['remaining'],
  };
  const html = render(batch);
  expect(html).not.toContain('失败项重试成功');
  expect(html).not.toContain('role="dialog"');
  expect(html).toContain('继续处理剩余项 · 1张');
});

it.each(['pending', 'unknown', 'failed'] as const)(
  'never shows failure retry success while the outcome is %s',
  (condition) => {
    const batch = state({
      pending: condition === 'pending',
      unresolved: condition === 'unknown',
    });
    if (condition === 'unknown') batch.workspace!.unknownIds = ['first'];
    if (condition === 'failed')
      batch.workspace!.results = [
        { id: 'first', status: 'failed', message: '写入失败', inQuery: true },
      ];
    expect(render(batch)).not.toContain('失败项重试成功');
  },
);

it('uses the real album source in the original result overview and retained failure footer', () => {
  const batch = state({ returnLabel: '返回相册内容' });
  expect(render(batch)).toContain('返回相册内容');
  batch.showFailures = true;
  const footer = renderToStaticMarkup(
    createElement(BatchSummaryFooter, { batch }),
  );
  expect(footer).toContain('返回相册内容');
  expect(footer).not.toContain('返回图库');
});

it('keeps the known thumbnail of an invalid failure that only left the filter', () => {
  const batch = state({ showFailures: true });
  batch.workspace!.results = [
    {
      id: 'first',
      status: 'failed',
      message: '图片已不再属于本次查询',
      inQuery: false,
    },
  ];
  const html = render(batch);
  expect(html).toContain('src="/i/first?type=thumbnail"');
  expect(html).toContain('图片已不再属于本次查询');
  expect(html).toContain('已删除或离开本次查询，已移除选择');
});
