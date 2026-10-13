import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { StorageSummary } from '../../../src/components/storage/storage-api';
import { StorageConnectionResult } from '../../../src/components/storage/storage-connection-result';
import { connectionReportRows } from '../../../src/components/storage/connection-report';
import { CorsRows } from '../../../src/components/storage/cors-report';
import type { ConnectionReport } from '../../../src/server/storage/probe-types';

function report(overrides: Partial<ConnectionReport> = {}): ConnectionReport {
  return {
    probeId: 'probe-real',
    storageId: 'storage-real',
    revision: 2,
    passed: false,
    stale: false,
    cleanupPending: false,
    stages: [
      {
        stage: 'configuration',
        status: 'failed',
        error: {
          message: '权限不足',
          code: 'STORAGE_OPERATION_FAILED',
          serviceCode: 'AccessDenied',
          requestId: 'request-actual',
          httpStatusCode: 403,
        },
      },
      { stage: 'write', status: 'skipped' },
      { stage: 'read', status: 'skipped' },
      { stage: 'anonymous', status: 'skipped' },
      { stage: 'delete', status: 'skipped' },
    ],
    testedAt: '2026-10-04T01:00:00.000Z',
    deploymentRequirement: 'Bucket 必须保持私有',
    ownerConfirmation: { wholeBucketHasNoLockRules: false, confirmedAt: null },
    ...overrides,
  };
}

vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer: ReactNode;
  }) => jsx('div', { children: [children, footer] }),
}));
const storage = {
  id: 'storage-real',
  name: '实际归档',
  type: 's3',
  enabled: false,
  hasAccessKey: true,
  hasSecretKey: true,
  corsStatus: 'untested',
} as StorageSummary;
function rows(value: ConnectionReport) {
  return renderToStaticMarkup(
    jsx(CorsRows, { rows: connectionReportRows(value) }),
  );
}
function result(value: ConnectionReport) {
  return renderToStaticMarkup(
    jsx(StorageConnectionResult, {
      shell: {
        name: 'Ariso',
        description: '',
        email: 'owner@example.test',
        ownerName: 'Owner',
      },
      storage,
      report: value,
      busy: false,
      onReturn: () => {},
      onTest: () => {},
      onEnable: () => {},
    }),
  );
}

it('does not describe skipped deletion as an object that was deleted', () => {
  const html = rows(report());
  expect(html).toContain('未尝试写入测试对象，无需删除');
  expect(html).not.toContain('已删除');
  const page = result(
    report({
      stages: [
        {
          stage: 'write',
          status: 'failed',
          error: { message: 'write rejected' },
        },
        { stage: 'delete', status: 'skipped' },
      ],
    }),
  );
  expect(page).toContain('连接测试未通过');
});
it('preserves service diagnostics and real probe identity in the running report views', () => {
  const html = result(report({ stale: true }));
  for (const text of [
    '权限不足',
    'STORAGE_OPERATION_FAILED',
    'AccessDenied',
    '403',
    'request-actual',
    'probe-real',
  ])
    expect(html).toContain(text);
});
it('keeps failed test status after cleanup succeeds and hides obsolete cleanup errors', () => {
  const html = result(
    report({
      stages: [
        {
          stage: 'delete',
          status: 'failed',
          error: { message: 'OldCleanupFailure' },
        },
      ],
    }),
  );
  expect(html).toContain('连接测试未通过');
  expect(html).toContain('本次已知测试对象已清理');
  expect(html).not.toContain('OldCleanupFailure');
});
it('does not offer enable from a stale passed report', () => {
  const html = result(report({ passed: true, stale: true }));
  expect(html).toContain('连接测试结果已失效');
  expect(html).toContain('不能用于启用当前配置');
  expect(html).not.toContain('data-testid="storage-enable"');
});
it('keeps pending cleanup visible independently of other stages', () => {
  const html = result(
    report({
      cleanupPending: true,
      stages: [
        {
          stage: 'delete',
          status: 'failed',
          error: { message: 'DeleteAccessDenied' },
        },
      ],
    }),
  );
  expect(html).toContain('删除失败使连接测试失败');
  expect(html).toContain('DeleteAccessDenied');
  expect(html).not.toContain('已删除');
});
it('does not describe a failed or unconfirmed anonymous read as passing', () => {
  const readable = report({
    stages: [
      {
        stage: 'anonymous',
        status: 'failed',
        error: { message: 'Anonymous readable', httpStatusCode: 200 },
      },
    ],
  });
  expect(result(readable)).toContain('测试对象可公开读取');
  const unknown = report({
    stages: [
      {
        stage: 'anonymous',
        status: 'failed',
        error: { message: 'Service timeout' },
      },
    ],
  });
  expect(rows(unknown)).toContain('Service timeout');
  expect(rows(unknown)).not.toContain('对象服务拒绝匿名访问');
});

it('keeps the report card at the same React position as the pending tail finishes', () => {
  function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
    return Children.toArray(node).flatMap((child) => {
      if (!isValidElement<Record<string, unknown>>(child)) return [];
      return [child, ...elements(child.props.children as ReactNode)];
    });
  }
  function card(value: ConnectionReport, busy: boolean) {
    const tree = StorageConnectionResult({
      shell: {
        name: 'Ariso',
        description: '',
        email: 'owner@example.test',
        ownerName: 'Owner',
      },
      storage,
      report: value,
      busy,
      onReturn: vi.fn(),
      onTest: vi.fn(),
      onEnable: vi.fn(),
    });
    const parent = elements(tree).find(
      (element) => element.props['data-testid'] === 'storage-connection-report',
    )!;
    const siblings = Children.toArray(parent.props.children as ReactNode);
    const index = siblings.findIndex(
      (child) => isValidElement(child) && child.type === CorsRows,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const element = siblings[index] as ReactElement;
    return {
      parent: parent.type,
      index,
      type: element.type,
      key: element.key,
      html: renderToStaticMarkup(element),
    };
  }
  const prefix = [
    { stage: 'configuration', status: 'passed' },
    { stage: 'write', status: 'passed' },
    { stage: 'read', status: 'passed' },
  ] as const;
  const pending = card(
    report({
      stages: [
        ...prefix,
        { stage: 'anonymous', status: 'pending' },
        { stage: 'delete', status: 'pending' },
      ],
    }),
    true,
  );
  expect(pending.html).toContain('匿名读取 / 清理');

  const tailFinished = card(
    report({
      stages: [
        ...prefix,
        { stage: 'anonymous', status: 'passed' },
        { stage: 'delete', status: 'pending' },
      ],
    }),
    true,
  );
  expect(tailFinished.html).not.toContain('匿名读取 / 清理');
  expect(tailFinished.html).toContain('对象服务拒绝匿名访问');

  const passed = card(
    report({
      passed: true,
      stages: [
        ...prefix,
        { stage: 'anonymous', status: 'passed' },
        { stage: 'delete', status: 'passed' },
      ],
    }),
    false,
  );
  expect(passed.html).not.toContain('Bucket 支持范围');
  expect(passed.html).toContain('已删除');

  const cleanupFailed = card(
    report({
      cleanupPending: true,
      stages: [
        ...prefix,
        { stage: 'anonymous', status: 'passed' },
        {
          stage: 'delete',
          status: 'failed',
          error: {
            message: 'Delete denied',
            serviceCode: 'AccessDenied',
            httpStatusCode: 403,
            requestId: 'cleanup-request',
          },
        },
      ],
    }),
    false,
  );
  for (const text of [
    'Delete denied',
    'AccessDenied',
    '403',
    'cleanup-request',
    '清理责任',
  ])
    expect(cleanupFailed.html).toContain(text);

  for (const current of [tailFinished, passed, cleanupFailed]) {
    expect(current).toMatchObject({
      parent: pending.parent,
      index: pending.index,
      type: pending.type,
      key: pending.key,
    });
  }
});
