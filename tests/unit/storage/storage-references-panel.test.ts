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
    libraryImages: 1,
    trashImages: 1,
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
  taskReferences: {
    jobs: [
      {
        id: 'job-ready',
        imageId: 'ready-image',
        displayName: '已经就绪的照片',
        kind: 'process',
        scope: 'all',
        status: 'running',
        processingStatus: 'ready',
        trashedAt: null,
        thumbnailPath: null,
      },
    ],
    cleanupJobs: [
      {
        id: 'cleanup-trash',
        imageId: 'trash-image',
        displayName: '待清理照片',
        status: 'failed',
        trashedAt: '2026-10-04T00:00:00.000Z',
        thumbnailPath: null,
      },
    ],
  },
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

it('separates storage-scoped image, processing and deletion destinations', () => {
  const html = renderReference();
  expect(html).toContain('查看图库');
  expect(html).toContain('查看回收记录');
  expect(html).toContain(
    '/library?storageId=actual-storage-id&amp;storageReturn=',
  );
  expect(html).toContain(
    '/trash?storageId=actual-storage-id&amp;storageReturn=',
  );
  expect(html).toContain('查看处理任务');
  expect(html).toContain('查看删除清理');
  expect(html).toContain('image=trash-image');
  expect(html).not.toContain('查看删除清理（1）');
  expect(html).not.toContain('前往回收站');
});

it('keeps overlapping reference categories distinct rather than reporting a summed image total', () => {
  const html = renderReference();
  for (const text of [
    '引用与清理',
    '仍有引用',
    '1 张图库图片 · 1 张回收图片 · 3 个版本',
    '处理 5 项 / 删除清理 2 项',
    '本地活动写入 2 项',
    '1 个探测对象清理失败',
    'aria-label="引用说明"',
  ])
    expect(html).toContain(text);
  expect(html.match(/<dt\b/g)).toHaveLength(4);
  expect(html).not.toContain('包含正常、失败、处理中及回收站');
  expect(html).not.toContain('有效签名本身不单独阻塞');
  expect(html).not.toContain('分类可能重叠');
  expect(html).not.toContain('<table');
  expect(html).not.toContain('查看清理状态');
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
  expect(html).toContain('引用与清理');
  expect(html).toContain('无引用');
  expect(html).toContain('aria-label="引用说明"');
  expect(html).toContain('查看清理');
  expect(html).not.toContain('查看图片');
  expect(html).not.toContain('查看上传');
  expect(html).not.toContain('前往回收站');
  expect(html).not.toContain('可以安全删除');
  expect(html).not.toContain('引用为空不代表');
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

it('distinguishes a passed CORS test from availability while storage is disabled', () => {
  const detail: StorageDetail = {
    ...storage,
    corsOrigin: 'https://photos.example.test',
    corsReport: {
      probeId: 'actual-cors-probe',
      storageId: storage.id,
      revision: storage.configRevision,
      origin: 'https://photos.example.test',
      passed: true,
      stale: false,
      cleanupPending: false,
      stages: [],
      testedAt: probe.createdAt,
    },
  };
  const disabled = renderMaintenance(detail, 'default');
  expect(disabled).toContain('>检测通过<');
  expect(disabled).not.toContain('>可用<');
  expect(disabled).toContain('默认存储已停用');
  expect(disabled).toContain('当前配置尚未通过连接测试，不能重新启用');
  expect(disabled).toContain(detail.corsOrigin);

  const enabled = renderMaintenance({ ...detail, enabled: true }, 'default');
  expect(enabled).toContain('>可用<');
  for (const invalid of [
    { passed: false },
    { stale: true },
    { cleanupPending: true },
  ]) {
    const html = renderMaintenance(
      { ...detail, corsReport: { ...detail.corsReport!, ...invalid } },
      'default',
    );
    expect(html).toContain('>不可用<');
    expect(html).not.toContain('>检测通过<');
  }
});
