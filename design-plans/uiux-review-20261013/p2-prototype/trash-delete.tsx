import { useState } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { SearchField } from '@heroui/react/search-field';
import { ArrowLeft, MoreHorizontal, Search, Trash2 } from 'lucide-react';
import { TrashBatchWorkspaceContent } from '../../../src/components/library/trash-batch-workspace';
import type { TrashBatchWorkspace } from '../../../src/components/library/trash-batch-state';
import type { TrashBatch } from '../../../src/components/library/use-trash-batch';
import type { BatchSnapshotItem } from '../../../src/components/library/use-library-batch';
import { BatchThumbnail } from '../../../src/components/library/batch-targets';
import { Footer, buttonClass, usePrototype } from './shared';

const samples: BatchSnapshotItem[] = [
  {
    id: 'sample-19',
    displayName: '山野旅行-19',
    thumbnailUrl: '/samples/forest.jpg',
    storage: { id: 'local', name: '默认本地存储', enabled: true },
    visibility: 'private',
    hasAlbums: false,
    source: '当前页',
    inCurrentPage: true,
  },
  {
    id: 'sample-20',
    displayName: '山野旅行-20',
    thumbnailUrl: '/samples/mountain.jpg',
    storage: { id: 'local', name: '默认本地存储', enabled: true },
    visibility: 'private',
    hasAlbums: false,
    source: '当前页',
    inCurrentPage: true,
  },
];

export function TrashDeleteDemo() {
  const { mode } = usePrototype();
  const [phase, setPhase] = useState<'list' | 'confirm' | 'result'>('list');
  const [selected, setSelected] = useState<string[]>(['sample-19']);
  const [targets, setTargets] = useState<BatchSnapshotItem[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const visible = samples.filter(
    (sample) =>
      !removed.includes(sample.id) && sample.displayName.includes(query),
  );
  const selectedCount = selected.length;
  const close = () => setPhase('list');
  const open = () => {
    setTargets(samples.filter((sample) => selected.includes(sample.id)));
    setPhase('confirm');
  };
  const submit = () => {
    setRemoved((current) => [...current, ...targets.map((item) => item.id)]);
    setSelected([]);
    setPhase('result');
  };
  const workspace: TrashBatchWorkspace = {
    items: targets,
    currentCount: targets.length,
    query: 'scope=trash',
    phase: phase === 'result' ? 'result' : 'confirm',
    message: '',
    rows: targets.map((item) =>
      phase === 'result'
        ? {
            id: item.id,
            command: { type: 'delete-permanent' as const },
            state: 'task' as const,
            result: {
              id: item.id,
              status: 'accepted' as const,
              taskId: `sample-cleanup-${item.id}`,
              message: '已清理',
              inQuery: true,
              cleanup: {
                jobId: `demo-cleanup-${item.id}-20261013`,
                imageId: item.id,
                status: 'succeeded' as const,
                waitingForWrites: false,
                cycle: 1,
                error: null,
                finishedAt: '2026-10-13T12:00:00.000Z',
                totalObjects: null,
                deletedObjects: null,
                deletedPurposes: null,
                remaining: [],
              },
            },
          }
        : {
            id: item.id,
            command: { type: 'delete-permanent' as const },
            state: 'unsent' as const,
          },
    ),
  };
  const batch = {
    workspace,
    visible: phase !== 'list',
    pending: false,
    unknownIds: [],
    unsentIds: [],
    failedIds: [],
    failedTaskIds: [],
    unresolved: false,
    progressError: '',
    refreshError: '',
    refreshPending: false,
    close,
    submit,
  } as unknown as TrashBatch;
  const showList =
    phase !== 'result' && !(mode === 'before' && phase === 'confirm');

  return (
    <>
      {showList ? (
        <section className="grid min-w-0 gap-5">
          <header className="flex items-center justify-between">
            <h1 className="text-[28px] font-medium leading-normal md:text-[30px]">
              回收站
            </h1>
            <Button
              isIconOnly
              variant="outline"
              aria-label="刷新回收站"
              className="size-11 rounded-lg"
            >
              ↻
            </Button>
          </header>
          <p className="text-sm">{visible.length} 条记录</p>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <SearchField
              aria-label="搜索回收图片名称"
              value={query}
              onChange={setQuery}
              className="min-w-0 flex-1 md:max-w-90"
            >
              <SearchField.Group className="h-12 rounded-lg border border-border bg-background">
                <SearchField.SearchIcon>
                  <Search size={18} aria-hidden />
                </SearchField.SearchIcon>
                <SearchField.Input
                  placeholder="搜索文件名称"
                  className="h-12 min-w-0 text-sm"
                />
              </SearchField.Group>
            </SearchField>
            {selectedCount ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft p-1 text-sm"
                role="status"
              >
                <span className="px-2">已选 {selectedCount}</span>
                <Button className={buttonClass} onPress={open}>
                  <Trash2 size={16} aria-hidden /> 永久删除所选
                </Button>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3">
            {visible.map((item) => (
              <Card
                key={item.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-none"
              >
                <Card.Content className="p-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      aria-pressed={selected.includes(item.id)}
                      aria-label={`选择${item.displayName}`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border"
                      onClick={() =>
                        setSelected((current) =>
                          current.includes(item.id)
                            ? current.filter((id) => id !== item.id)
                            : [...current, item.id],
                        )
                      }
                    >
                      {selected.includes(item.id) ? '✓' : ''}
                    </button>
                    <BatchThumbnail
                      url={item.thumbnailUrl!}
                      className="size-12 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.displayName}</p>
                      <p className="text-xs text-muted">
                        原文件 6.5 KiB · {item.storage.name} · 私有
                      </p>
                    </div>
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label={`${item.displayName}的更多操作`}
                      className="size-11 shrink-0 rounded-lg"
                    >
                      <MoreHorizontal size={18} aria-hidden />
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
      {phase === 'result' && mode === 'after' ? (
        <TrashBatchWorkspaceContent batch={batch} />
      ) : null}
      {phase === 'result' && mode === 'before' ? (
        <section className="grid gap-5">
          <Button variant="ghost" className="w-fit" onPress={close}>
            <ArrowLeft size={16} aria-hidden />
            返回回收站
          </Button>
          <h1 className="text-[28px] font-medium">批量清理结果</h1>
          <p>
            已清理 {targets.length} / {targets.length} 张
          </p>
          <Card className="rounded-xl border border-border bg-surface p-4 shadow-none">
            <Card.Content className="grid gap-3 p-0 text-sm">
              <div className="grid grid-cols-3 gap-2 border-b border-border pb-2 text-muted">
                <span>文件</span>
                <span>结果</span>
                <span>详情与操作</span>
              </div>
              {targets.map((item) => (
                <div key={item.id} className="grid grid-cols-3 gap-2">
                  <span>{item.displayName}</span>
                  <Chip color="success" size="sm" variant="soft">
                    <Chip.Label>已清理</Chip.Label>
                  </Chip>
                  <span>
                    已全部清理，记录已移除。任务 demo-cleanup-{item.id}-20261013
                    周期 1
                  </span>
                </div>
              ))}
            </Card.Content>
          </Card>
        </section>
      ) : null}
      {phase === 'confirm' && mode === 'after' ? (
        <TrashBatchWorkspaceContent batch={batch} />
      ) : null}
      {phase === 'confirm' && mode === 'before' ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <AlertDialog.Backdrop>
            <AlertDialog.Container placement="center" className="p-4">
              <AlertDialog.Dialog className="w-full max-w-120 rounded-xl border border-border bg-background p-6">
                <AlertDialog.Header>
                  <AlertDialog.Heading>
                    永久删除已选{targets.length}张图片？
                  </AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body className="grid gap-4 text-sm">
                  <p>
                    共选{targets.length}张：当前页{targets.length}
                    张，其他页0张。
                  </p>
                  <p className="rounded-lg bg-default p-3">
                    任务受理后不可恢复。仅处理本次选定的{targets.length}
                    张图片，逐项返回结果；不会清空全部筛选结果。
                  </p>
                </AlertDialog.Body>
                <AlertDialog.Footer className="grid gap-3">
                  <Button
                    autoFocus
                    variant="outline"
                    className={buttonClass}
                    onPress={close}
                  >
                    取消
                  </Button>
                  <Button className={buttonClass} onPress={submit}>
                    确认永久删除
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      ) : null}
      {phase === 'list' ? (
        <Footer>
          <p className="mr-auto text-sm">共 {visible.length} 项</p>
          <span className="text-sm">1 / 1</span>
        </Footer>
      ) : null}
      {phase === 'result' && mode === 'before' ? (
        <Footer>
          <Button variant="outline" className={buttonClass} onPress={close}>
            返回回收站
          </Button>
        </Footer>
      ) : null}
    </>
  );
}
