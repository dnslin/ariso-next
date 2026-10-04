import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CleanupContent } from '../../../src/components/library/cleanup-workspace';
import type { CleanupController } from '../../../src/components/library/use-cleanup';
import type { LibraryDetail } from '../../../src/server/library/detail-types';

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

function state(waitingForWrites: boolean): CleanupController {
  return {
    visible: true,
    confirmation: false,
    storageConfirmed: false,
    progress: false,
    record: {
      id: 'image',
      displayName: 'old-cover.jpg',
      storage: { id: 'local', name: '本地', enabled: true },
    } as LibraryDetail,
    task: {
      jobId: 'job',
      imageId: 'image',
      status: 'queued',
      waitingForWrites,
      cycle: 1,
      error: null,
      finishedAt: null,
      totalObjects: 1,
      deletedObjects: 0,
      deletedPurposes: [],
      remaining: [
        {
          objectId: 'original',
          key: 'original.jpg',
          purpose: 'original',
          status: 'cleanup_pending',
          byteSize: null,
          attempts: 0,
          error: null,
          nextAttemptAt: null,
        },
      ],
    },
    pending: false,
    unknown: false,
    error: '',
    refreshError: '',
    open: vi.fn(),
    close: vi.fn(),
    check: vi.fn(),
    showProgress: vi.fn(),
    confirmStorage: vi.fn(),
    submit: vi.fn(),
    retry: vi.fn(),
    retryRefresh: vi.fn(),
  };
}

const render = (cleanup: CleanupController) =>
  renderToStaticMarkup(
    createElement(CleanupContent, { cleanup, onBack: vi.fn() }),
  );

it('shows the waiting dialog only for an accepted task with active write responsibility', () => {
  const html = render(state(true));
  expect(html).toContain('等待当前处理结束');
  expect(html).toContain('old-cover.jpg · 删除中');
  expect(html).toContain(
    '正在停止或等待当前写入结束，并核对可能迟到的文件。全部清理完成前，记录不会移除。',
  );
  expect(html).toContain('查看清理进度');
  expect(html).not.toContain('已加入删除队列');
  expect(html).not.toContain('任务 job');
});

it('retains the ordinary accepted queue dialog when no active writer remains', () => {
  const html = render(state(false));
  expect(html).toContain('已加入删除队列');
  expect(html).toContain('查看任务状态');
  expect(html).not.toContain('等待当前处理结束');
});

it.each([true, false])(
  'shows actual active write responsibility in progress when waitingForWrites=%s',
  (waitingForWrites) => {
    const cleanup = state(waitingForWrites);
    cleanup.progress = true;
    cleanup.task!.status = waitingForWrites ? 'queued' : 'running';
    const html = render(cleanup);
    expect(html).toContain('活动写入');
    expect(html).toContain(waitingForWrites ? '等待结束' : '已结束');
    expect(html).toContain(
      waitingForWrites ? '仍有未完成写入责任' : '无未完成写入责任',
    );
    expect(html).toContain('大小待核对');
    expect(html).not.toContain('永久删除完成');
  },
);
