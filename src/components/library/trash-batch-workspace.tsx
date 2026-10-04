'use client';

import { useEffect, useRef } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Alert } from '@heroui/react/alert';
import { Spinner } from '@heroui/react/spinner';
import { ArrowLeft } from 'lucide-react';
import type { TrashBatch } from './use-trash-batch';
import { TrashBatchResults } from './trash-batch-results';

const footerButton =
  'h-12 min-h-12 min-w-0 flex-1 rounded-lg px-2 font-normal md:w-50 md:flex-none';

export function TrashBatchWorkspaceContent({ batch }: { batch: TrashBatch }) {
  const title = useRef<HTMLHeadingElement>(null);
  const workspace = batch.workspace;
  useEffect(() => {
    if (batch.visible && workspace?.phase === 'result')
      title.current?.focus({ preventScroll: true });
  }, [batch.visible, workspace?.phase]);
  if (!workspace || !batch.visible) return null;
  if (workspace.phase === 'confirm')
    return (
      <AlertDialog
        isOpen
        onOpenChange={(open) => {
          if (!open) batch.close();
        }}
      >
        <AlertDialog.Backdrop isKeyboardDismissDisabled={false}>
          <AlertDialog.Container placement="center" className="p-4">
            <AlertDialog.Dialog
              data-testid="trash-batch-confirm"
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 dark:bg-surface"
            >
              <AlertDialog.Header className="p-0">
                <AlertDialog.Heading className="text-xl font-medium leading-normal">
                  永久删除已选{workspace.items.length}张图片？
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="m-0 grid gap-4 p-0">
                <p className="text-sm leading-normal">
                  共选{workspace.items.length}张：当前页{workspace.currentCount}
                  张，其他页{workspace.items.length - workspace.currentCount}
                  张。
                </p>
                <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
                  任务受理后不可恢复。仅处理本次选定的{workspace.items.length}
                  张图片，逐项返回结果；不会清空全部筛选结果。
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="m-0 grid w-full grid-cols-1 gap-4 p-0">
                <Button
                  autoFocus
                  variant="outline"
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={batch.close}
                >
                  取消
                </Button>
                <Button
                  data-testid="trash-batch-submit"
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={batch.submit}
                >
                  确认永久删除
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    );
  const completed = workspace.rows.filter(
    (row) => row.result?.cleanup?.status === 'succeeded',
  ).length;
  const failed = workspace.rows.filter(
    (row) => row.result?.cleanup?.status === 'failed',
  ).length;
  const running = workspace.rows.filter(
    (row) =>
      row.result?.cleanup?.status === 'queued' ||
      row.result?.cleanup?.status === 'running',
  ).length;
  const rejected = workspace.rows.filter(
    (row) => row.state === 'rejected',
  ).length;
  const secondary = [
    running ? `清理中 ${running} 张` : '',
    rejected ? `未受理 ${rejected} 张` : '',
    batch.unknownIds.length ? `待核对 ${batch.unknownIds.length} 张` : '',
    batch.unsentIds.length ? `未提交 ${batch.unsentIds.length} 张` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section
      data-testid="trash-batch"
      aria-labelledby="trash-batch-title"
      aria-busy={batch.pending}
      className="grid min-w-0 gap-5"
    >
      <header>
        <Button
          variant="ghost"
          className="-ml-2 mb-3 h-11 w-fit gap-1 rounded-lg bg-transparent px-2 text-xs font-normal text-muted hover:bg-transparent"
          onPress={batch.close}
        >
          <ArrowLeft size={14} aria-hidden />
          返回回收站
        </Button>
        <h1
          ref={title}
          id="trash-batch-title"
          tabIndex={-1}
          className="mb-3 text-[28px] font-medium leading-normal"
        >
          批量清理结果
        </h1>
        <p
          role="status"
          data-testid="trash-batch-summary"
          className="text-sm font-medium leading-normal"
        >
          已清理 {completed} / {workspace.items.length} 张
          {failed ? ` · 清理失败 ${failed} 张` : ''}
        </p>
        {secondary ? (
          <p className="mt-1 text-[13px] leading-normal text-muted">
            {secondary}
          </p>
        ) : null}
      </header>
      {batch.pending ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner size="sm" />
          正在提交…
        </p>
      ) : null}
      {workspace.message && !batch.unresolved ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>{workspace.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {batch.unresolved ? (
        <div className="grid justify-items-start gap-2">
          <p className="text-[13px] text-muted">
            请先核对未决结果，再继续提交或重试。
          </p>
          <Button
            data-testid="trash-batch-check"
            variant="outline"
            className="min-h-11 w-fit rounded-lg font-normal"
            isDisabled={batch.pending}
            onPress={batch.check}
          >
            核对结果 · {batch.unknownIds.length}张
          </Button>
        </div>
      ) : null}
      {batch.progressError ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>
              清理进度读取失败：{batch.progressError}
            </Alert.Description>
            <Button
              variant="outline"
              className="mt-3 h-11 rounded-lg"
              onPress={batch.checkProgress}
            >
              重新读取进度
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {batch.refreshError ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>
              列表刷新失败：{batch.refreshError}
            </Alert.Description>
            <Button
              variant="outline"
              className="mt-3 h-11 rounded-lg"
              isDisabled={batch.refreshPending}
              onPress={batch.retryRefresh}
            >
              重新读取回收站
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      <TrashBatchResults key={workspace.items[0]?.id} batch={batch} />
    </section>
  );
}

export function TrashBatchWorkspaceFooter({ batch }: { batch: TrashBatch }) {
  if (!batch.workspace || !batch.visible || batch.workspace.phase === 'confirm')
    return null;
  return (
    <div className="flex w-full gap-3 md:justify-end">
      <Button
        data-testid="trash-batch-done"
        variant="outline"
        className={footerButton}
        onPress={batch.close}
      >
        返回回收站
      </Button>
    </div>
  );
}
