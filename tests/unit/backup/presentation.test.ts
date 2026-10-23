import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { BackupScope } from '../../../src/components/backup/backup-scope';
import { BackupHistory } from '../../../src/components/backup/backup-history';
import { RestoreOutcome } from '../../../src/components/backup/restore-outcome';
import { RestoreSource } from '../../../src/components/backup/restore-source';
import { BackupPauseNotice } from '../../../src/components/backup/pause-notice';
import type { BackupJob, RestoreJob } from '../../../src/server/backup/types';
import { backupActivityKey } from '../../../src/components/backup/use-backup-activity';

describe('backup and restore presentation', () => {
  it('includes real local and remote storage counts, including disabled storage', () => {
    const html = renderToStaticMarkup(
      createElement(BackupScope, {
        scope: {
          images: 7,
          objects: 12,
          bytes: 1024,
          freeBytes: 4096,
          estimatedBytes: 2048,
          storages: [
            {
              id: 'local',
              name: '实际本地目录',
              type: 'local',
              enabled: true,
              images: 3,
              bytes: 512,
            },
            {
              id: 'remote',
              name: '实际远端',
              type: 's3',
              enabled: true,
              images: 4,
              bytes: 512,
            },
          ],
        },
      }),
    );
    expect(html).toContain('实际本地目录');
    expect(html).toContain('实际远端');
    expect(html).not.toContain('暂不支持');
    expect(html.match(/aria-label="包含在备份中"/g)).toHaveLength(2);
    expect(html).not.toContain('1,248');
  });
  it('only offers real ready-file downloads and keeps failed records visible', () => {
    const base = {
      kind: 'backup' as const,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
    const items: BackupJob[] = [
      { ...base, id: 'ready-one', status: 'ready', fileBytes: 100 },
      { ...base, id: 'failed-one', status: 'failed' },
    ];
    const html = renderToStaticMarkup(
      createElement(BackupHistory, {
        items,
        timeZone: 'UTC',
        busy: false,
        onDelete: vi.fn(),
      }),
    );
    expect(html).toContain('/api/backups/ready-one/file');
    expect(html).not.toContain('/api/backups/failed-one/file');
    expect(html).toContain('未完成');
  });
  it('does not show a completed restore when only the byte counter reached its total', () => {
    const job: RestoreJob = {
      id: 'restore',
      kind: 'restore',
      createdAt: 1,
      updatedAt: 1,
      status: 'restoring',
      uploadBytes: 10,
      receivedBytes: 10,
      progress: {
        bytesDone: 100,
        bytesTotal: 100,
        objectsDone: 1,
        objectsTotal: 1,
      },
    };
    const props = {
      job,
      busy: false,
      onRetry: vi.fn(),
      onCancel: vi.fn(),
      onRefresh: vi.fn(),
    };
    const copying = renderToStaticMarkup(createElement(RestoreOutcome, props));
    expect(copying).toContain('正在校验并准备启用数据，请等待');
    expect(copying).not.toContain('数据已恢复，等待重启');
    const ready = renderToStaticMarkup(
      createElement(RestoreOutcome, {
        ...props,
        job: { ...job, status: 'ready' },
      }),
    );
    expect(ready).toContain('数据已恢复，等待重启');
    expect(ready).not.toMatch(/模拟重启|一键重启/);
  });
  it('shows the approved import fields together before server authorization', () => {
    const html = renderToStaticMarkup(
      createElement(RestoreSource, {
        code: '',
        password: '',
        file: null,
        job: null,
        errors: {},
        authorized: false,
        busy: false,
        onCode: vi.fn(),
        onPassword: vi.fn(),
        onFile: vi.fn(),
      }),
    );
    expect(html).toContain('初始化码');
    expect(html).toContain('id="restore-file"');
    expect(html).toContain('id="restore-password"');
  });
  it('shows pause feedback from the shared job state and retains the progress link', () => {
    const client = new QueryClient();
    client.setQueryData(backupActivityKey, { paused: true, job: null });
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(BackupPauseNotice),
      ),
    );
    expect(html).toContain('正在创建备份，暂时无法修改内容');
    expect(html).toContain('图片浏览与外链访问不受影响');
    expect(html).toContain('href="/settings/backup"');
  });
});

it('keeps a cancelled restore with unfinished cleanup out of the blank import flow', () => {
  const job: RestoreJob = {
    id: 'cleanup',
    kind: 'restore',
    createdAt: 1,
    updatedAt: 1,
    status: 'cancelled',
    uploadBytes: 10,
    receivedBytes: 10,
    cleanupPending: true,
    failure: { code: 'CLEANUP_FAILED', message: '临时文件清理失败' },
  };
  const html = renderToStaticMarkup(
    createElement(RestoreOutcome, {
      job,
      busy: false,
      onRetry: vi.fn(),
      onCancel: vi.fn(),
      onRefresh: vi.fn(),
    }),
  );
  expect(html).toContain('临时文件尚未清理完成');
  expect(html).toContain('继续停止并清理');
  expect(html).not.toContain('数据已恢复，等待重启');
  expect(html).toContain('临时文件清理失败');
});
