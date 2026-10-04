import { jsx, jsxs } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { StorageReferenceView } from '../../../src/components/storage/storage-reference-view';
import { StorageMaintenanceView } from '../../../src/components/storage/storage-maintenance-view';
import type { StorageDetail } from '../../../src/components/storage/storage-api';

vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer: ReactNode;
  }) =>
    jsxs('main', { children: [children, jsx('footer', { children: footer })] }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));

const references = {
  counts: {
    images: 2,
    versions: 3,
    objects: 4,
    jobs: 5,
    cleanupJobs: 2,
    uploads: 6,
    probes: 1,
    orphans: 1,
  },
  activeWrites: 2,
};
const remoteError = {
  message: 'delete blocked',
  code: 'DELETE_FAILED',
  serviceCode: 'ActualAccessDenied',
  httpStatusCode: 403,
  requestId: 'actual-request-id',
  key: 'actual/error/path',
  operation: 'delete',
};
const probe: StorageDetail['probes'][number] = {
  id: 'actual-probe-id',
  storageId: 'actual-storage-id',
  purpose: 'connection',
  configRevision: 1,
  origin: null,
  invalidated: false,
  expiresAt: null,
  key: 'probes/actual-probe-id',
  state: 'cleanup',
  stage: 'delete',
  objectState: 'stored',
  byteSize: 64,
  confirmedAt: '2026-10-04T00:00:00.000Z',
  cleanupAttempts: 2,
  nextCleanupAt: '2026-10-04T01:00:00.000Z',
  error: JSON.stringify(remoteError),
  report: {
    probeId: 'actual-probe-id',
    storageId: 'actual-storage-id',
    revision: 1,
    passed: false,
    stale: false,
    cleanupPending: true,
    stages: [],
    testedAt: '2026-10-04T00:00:00.000Z',
    deploymentRequirement: '保持私有',
    ownerConfirmation: { wholeBucketHasNoLockRules: false, confirmedAt: null },
  },
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};
const storage: StorageDetail = {
  id: 'actual-storage-id',
  name: '实际存储',
  type: 's3',
  enabled: false,
  localPath: null,
  endpoint: 'https://s3.example.com',
  region: 'auto',
  bucket: 'archive',
  pathPrefix: 'images',
  forcePathStyle: false,
  hasAccessKey: true,
  hasSecretKey: true,
  configRevision: 1,
  connectionStatus: 'failed',
  connectionRevision: 1,
  connectionReport: probe.report as StorageDetail['connectionReport'],
  connectionTestedAt: probe.createdAt,
  corsStatus: 'untested',
  corsReport: null,
  corsRevision: null,
  corsOrigin: null,
  corsTestedAt: null,
  createdAt: probe.createdAt,
  updatedAt: probe.updatedAt,
  probes: [probe],
  references,
  scan: null,
  orphans: { storageId: 'actual-storage-id', knownBytes: 0, objects: [] },
};
const shell = {
  name: 'Ariso',
  description: '站点',
  email: 'owner@example.com',
  ownerName: 'Owner',
};
function renderReference(detail: StorageDetail = storage) {
  return renderToStaticMarkup(
    jsx(StorageReferenceView, {
      shell,
      storage: detail,
      busy: false,
      onReturn: () => {},
      onCleanup: () => {},
    }),
  );
}
function renderMaintenance(
  detail: StorageDetail = storage,
  view: 'cleanup' | 'default' = 'cleanup',
) {
  return renderToStaticMarkup(
    jsx(StorageMaintenanceView, {
      shell,
      storage: detail,
      view,
      defaultStorageId: detail.id,
      busy: false,
      onReturn: () => {},
      onRefresh: async () => {},
      onRetryCleanup: async () => {},
      onRetryScan: async () => {},
      onDisable: () => {},
    }),
  );
}

it('keeps overlapping reference categories distinct rather than reporting a summed image total', () => {
  const html = renderReference();
  for (const text of [
    '2 张 / 3 个',
    '处理 5 项 / 删除清理 2 项',
    '分类可能重叠',
    '本地活动写入 2 项',
    '有效签名本身不单独阻塞',
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('强制删除</');
});

it('displays actual cleanup identity, key, complete remote error, retry date and retained responsibility', () => {
  const html = renderMaintenance();
  for (const text of [
    'actual-probe-id',
    'probes/actual-probe-id',
    'ActualAccessDenied',
    'DELETE_FAILED',
    'actual-request-id',
    'HTTP：403',
    'actual/error/path',
    '2026-10-04T01:00:00.000Z',
    '存储停用时也可清理',
    '对象删除成功前不能解除引用或删除配置',
    '重试清理',
  ])
    expect(html).toContain(text);
});

it('does not offer cleanup retry while the probe is still running', () => {
  const html = renderMaintenance({
    ...storage,
    probes: [{ ...probe, state: 'running', error: null }],
  });
  expect(html).toContain('等待运行中的探测结束');
  expect(html).not.toContain('重试清理');
});

it('does not treat empty references as proof that scanning or configuration deletion has completed', () => {
  const html = renderReference({
    ...storage,
    references: { counts: {}, activeWrites: 0 },
    probes: [],
  });
  expect(html).toContain('当前没有存储引用');
  expect(html).toContain('删除配置时仍由服务器检查受管对象和扫描结果');
  expect(html).not.toContain('扫描完成');
});

it('keeps failed orphan keys and complete scan and remote diagnostics visible', () => {
  const orphanError = {
    ...remoteError,
    serviceCode: 'OrphanAccessDenied',
    requestId: 'orphan-request-id',
  };
  const detail: StorageDetail = {
    ...storage,
    orphans: {
      storageId: storage.id,
      knownBytes: 64,
      objects: [
        {
          storageId: storage.id,
          key: 'actual/orphan/key',
          size: 64,
          confirmedAt: probe.createdAt,
          error: orphanError,
        },
      ],
    },
  };
  const html = renderMaintenance(detail);
  for (const text of [
    'actual/orphan/key',
    'OrphanAccessDenied',
    'orphan-request-id',
    'HTTP：403',
    'actual/error/path',
    '64 字节',
    '尚无扫描记录',
  ])
    expect(html).toContain(text);
  const scanned = renderMaintenance({
    ...detail,
    scan: {
      storageId: storage.id,
      configRevision: 1,
      scope: {
        type: 's3',
        localPath: null,
        endpoint: storage.endpoint,
        bucket: storage.bucket,
        pathPrefix: storage.pathPrefix,
        namespace: 'ariso/managed',
      },
      startedAt: probe.createdAt,
      finishedAt: probe.updatedAt,
      status: 'failed',
      discoveredCount: 1,
      deletedCount: 0,
      failedCount: 1,
      protectedCount: 0,
      error: { ...remoteError, requestId: 'scan-request-id' },
    },
  });
  for (const text of [
    'scan-request-id',
    'ActualAccessDenied',
    'DELETE_FAILED',
    'actual/error/path',
    'HTTP：403',
  ])
    expect(scanned).toContain(text);
});

it('requires testing the current S3 revision before re-enabling a disabled default', () => {
  const failed = renderMaintenance(storage, 'default');
  expect(failed).toContain('返回配置并测试');
  expect(failed).toContain('当前配置尚未通过连接测试，不能重新启用');
  expect(failed).not.toContain('>重新启用</button>');
  const passed = {
    ...storage,
    connectionStatus: 'passed' as const,
    connectionRevision: 1,
    connectionReport: {
      ...storage.connectionReport!,
      passed: true,
      stale: false,
      cleanupPending: false,
    },
  };
  expect(renderMaintenance(passed, 'default')).toContain('重新启用');
  expect(
    renderMaintenance({ ...passed, configRevision: 2 }, 'default'),
  ).toContain('返回配置并测试');
});
