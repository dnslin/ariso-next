'use client';

import type { MouseEvent } from 'react';
import { Accordion } from '@heroui/react/accordion';
import { Link } from '@heroui/react/link';
import { ArrowRight } from 'lucide-react';
import type { StorageDetail } from './storage-api';
import { storageReferenceDestination } from './reference-navigation';
import { BatchThumbnail } from '../library/batch-targets';

const taskStatus = {
  queued: '等待处理',
  running: '处理中',
  failed: '清理失败',
  succeeded: '已完成',
  cancelled: '已取消',
};
const imageStatus = {
  pending: '待处理',
  processing: '处理中',
  ready: '已就绪',
  failed: '处理失败',
};

export function StorageReferenceTasks({
  storage,
  busy,
  onNavigate,
}: {
  storage: StorageDetail;
  busy: boolean;
  onNavigate?: (event: MouseEvent<Element>, href: string) => void;
}) {
  const groups = [
    {
      id: 'processing',
      label: '查看处理任务',
      tasks: storage.taskReferences.jobs.map((job) => ({
        ...job,
        detail: `${job.kind === 'metadata' ? '元数据读取' : job.processingStatus === 'ready' ? '重处理' : '图片处理'} · ${taskStatus[job.status]} · 图片：${imageStatus[job.processingStatus]}`,
        href: storageReferenceDestination(
          storage.id,
          Boolean(job.trashedAt),
          job.imageId,
        ),
      })),
    },
    {
      id: 'cleanup',
      label: '查看删除清理',
      tasks: storage.taskReferences.cleanupJobs.map((job) => ({
        ...job,
        detail: `删除清理 · ${taskStatus[job.status]}`,
        href: storageReferenceDestination(storage.id, true, job.imageId),
      })),
    },
  ];
  const singleCleanup =
    groups[1].tasks.length === 1 ? groups[1].tasks[0] : null;
  return (
    <div className="grid min-w-0 gap-1">
      {singleCleanup ? (
        <Link
          href={singleCleanup.href}
          isDisabled={busy}
          onClick={(event) => onNavigate?.(event, singleCleanup.href)}
          className="flex min-h-11 w-fit items-center gap-2 rounded-lg px-3 text-sm no-underline"
        >
          查看删除清理
          <ArrowRight size={16} aria-hidden />
        </Link>
      ) : null}
      <Accordion className="w-full rounded-lg bg-transparent" variant="surface">
        {groups
          .filter(
            (group) =>
              group.tasks.length && !(singleCleanup && group.id === 'cleanup'),
          )
          .map((group) => (
            <Accordion.Item key={group.id} id={group.id}>
              <Accordion.Heading>
                <Accordion.Trigger className="min-h-11 px-0 text-sm font-normal">
                  {group.label}（{group.tasks.length}）<Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="grid gap-0 px-0 pb-3">
                  {group.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex min-w-0 items-center gap-3 border-t border-border py-3"
                    >
                      <BatchThumbnail
                        url={storage.enabled ? task.thumbnailPath : null}
                        className="h-10 w-12 shrink-0 rounded-lg"
                      />
                      <div className="grid min-w-0 flex-1 gap-1">
                        <p className="text-sm [overflow-wrap:anywhere]">
                          {task.displayName}
                        </p>
                        <p className="text-xs text-muted">{task.detail}</p>
                      </div>
                      <Link
                        aria-label={`查看${group.id === 'cleanup' ? '回收记录' : '任务图片'}：${task.displayName}`}
                        href={task.href}
                        isDisabled={busy}
                        onClick={(event) => onNavigate?.(event, task.href)}
                        className="flex size-11 shrink-0 items-center justify-center rounded-lg"
                      >
                        <ArrowRight size={17} aria-hidden />
                      </Link>
                    </div>
                  ))}
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
      </Accordion>
    </div>
  );
}
