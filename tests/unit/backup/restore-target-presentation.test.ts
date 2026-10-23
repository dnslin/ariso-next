import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BackupSummary } from '../../../src/server/backup/manifest';
import type { RestoreRemoteTarget } from '../../../src/server/backup/restore-remote-types';
import { RestoreRemoteTargets } from '../../../src/components/backup/restore-targets';
import {
  RestoreConfirmation,
  RestoreLocalTargets,
  RestoreReview,
} from '../../../src/components/backup/restore-review';
import { remoteTargetInitial } from '../../../src/components/backup/restore-target-form';
const summary: BackupSummary = {
  application: { version: 'v1.2.0', revision: 'a'.repeat(40) },
  snapshotCompletedAt: 1,
  siteName: '实际站点',
  publicUrl: 'https://old.example.test',
  ownerEmail: 'owner@example.test',
  images: 7,
  trashedImages: 1,
  albums: 1,
  tags: 1,
  objects: 9,
  bytes: 900,
  storages: [
    {
      id: 'local',
      type: 'local',
      localPath: 'photos',
      name: '本地照片',
      images: 2,
      objects: 2,
      bytes: 200,
      enabled: true,
    },
    {
      id: 'remote',
      type: 's3',
      name: '远端归档',
      images: 5,
      objects: 7,
      bytes: 700,
      enabled: false,
    },
  ],
};
const saved: RestoreRemoteTarget = {
  storageId: 'remote',
  endpoint: 'https://new-s3.example.test',
  bucket: 'new-bucket',
  region: 'auto',
  pathPrefix: 'recovered',
  namespace: 'recovered/ariso/remote/',
  forcePathStyle: true,
  credentialsConfigured: true,
  revision: 2,
  testedRevision: 2,
  testStatus: 'passed',
  testedAt: 1,
  cleanupPending: false,
  writeStarted: false,
};
function model(target = saved, dirty = false) {
  return {
    targets: [target],
    input: () => remoteTargetInitial(target),
    dirty: () => dirty,
    change: vi.fn(),
    errors: () => ({}),
    ready: !dirty,
    testing: target.testStatus === 'testing',
    test: vi.fn(),
    repair: vi.fn(),
  };
}
describe('restore local and remote destinations', () => {
  it('identifies both storage types and confirms the actual new remote namespace without credentials', () => {
    const review = renderToStaticMarkup(
      createElement(RestoreReview, { summary, fileName: 'real.age' }),
    );
    expect(review).toContain('远端归档');
    expect(review).toContain('S3');
    const confirmed = renderToStaticMarkup(
      createElement(RestoreConfirmation, {
        summary,
        publicUrl: 'https://new.example.test',
        targets: [saved],
      }),
    );
    expect(confirmed).toContain('recovered/ariso/remote/');
    expect(confirmed).toContain('new-bucket');
    expect(confirmed).toContain('保留停用状态');
    expect(confirmed).not.toContain('secretKey');
    const local = renderToStaticMarkup(
      createElement(RestoreLocalTargets, {
        summary,
        publicUrl: '',
        busy: false,
        onUrl: vi.fn(),
      }),
    );
    expect(local).toContain('本地照片');
    expect(local).not.toContain('远端归档');
  });
  it('does not show an old passed connection for changed or stale configuration', () => {
    for (const current of [
      model(saved, true),
      model({ ...saved, testedRevision: 1 }),
    ]) {
      const html = renderToStaticMarkup(
        createElement(RestoreRemoteTargets, {
          summary,
          model: current,
          busy: false,
        }),
      );
      expect(html).not.toContain('连接通过');
      expect(html).not.toContain('新位置可用');
    }
  });
  it('shows asynchronous testing and disables its fields and repeated tests', () => {
    const html = renderToStaticMarkup(
      createElement(RestoreRemoteTargets, {
        summary,
        model: model({ ...saved, testStatus: 'testing' }),
        busy: false,
      }),
    );
    expect(html).toContain('正在测试连接');
    expect(html).toContain('data-state="testing"');
    expect(
      html.match(/<input\b[^>]*id="restore-remote-bucket"[^>]*>/)?.[0],
    ).toContain('disabled=""');
  });
  it('keeps failed cleanup destinations visible and only allows credential repair', () => {
    const target = {
      ...saved,
      writeStarted: true,
      cleanupPending: true,
      failure: {
        code: 'S3_ACCESS_DENIED',
        message: '原凭据失效，清理尚未完成',
      },
    };
    const html = renderToStaticMarkup(
      createElement(RestoreRemoteTargets, {
        summary,
        model: model(target),
        busy: false,
        cleanup: true,
      }),
    );
    expect(html).toContain('recovered/ariso/remote/');
    expect(html).toContain('原凭据失效，清理尚未完成');
    expect(html).toContain('保存凭据并继续清理');
    expect(html).not.toContain('新位置可用');
    expect(
      html.match(/<input\b[^>]*id="restore-remote-endpoint"[^>]*>/)?.[0],
    ).toContain('disabled=""');
    expect(
      html.match(/<input\b[^>]*id="restore-remote-secretKey"[^>]*>/)?.[0],
    ).not.toContain('disabled=""');
  });
});
