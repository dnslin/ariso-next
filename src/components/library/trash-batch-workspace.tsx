'use client';

import { useEffect, useRef } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Alert } from '@heroui/react/alert';
import { Spinner } from '@heroui/react/spinner';
import { ArrowLeft } from 'lucide-react';
import type { TrashBatch } from './use-trash-batch';

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
    (row) => row.cleanup?.status === 'succeeded',
  ).length;
  const failed = workspace.rows.filter(
    (row) => row.cleanup?.status === 'failed',
  ).length;
  const running = workspace.rows.filter(
    (row) =>
      row.cleanup?.status === 'queued' || row.cleanup?.status === 'running',
  ).length;
  const rejected = workspace.rows.filter(
    (row) => row.state === 'rejected',
  ).length;
  const rows = [
    { label: '已全部清理', count: completed, detail: '记录已移除' },
    { label: '清理失败', count: failed, detail: '可重试剩余对象，不可恢复' },
    { label: '仍在清理', count: running, detail: '记录保留，不可恢复' },
    {
      label: '受理失败',
      count: rejected,
      detail: `${batch.failedIds.length}张仍保留选择，可重新提交`,
    },
  ];
  return (
    <section
      data-testid="trash-batch"
      aria-labelledby="trash-batch-title"
      aria-busy={batch.pending}
      className="grid min-w-0 gap-5"
    >
      <Button
        variant="ghost"
        className="-my-3 h-11 w-fit gap-1 rounded-lg bg-transparent p-0 text-xs font-normal text-muted hover:bg-transparent"
        onPress={batch.close}
      >
        <ArrowLeft size={14} aria-hidden />
        返回回收站
      </Button>
      <h1
        ref={title}
        id="trash-batch-title"
        tabIndex={-1}
        className="text-[28px] font-medium leading-normal md:text-[30px]"
      >
        批量清理进度
      </h1>
      <p
        role="status"
        data-testid="trash-batch-summary"
        className="text-[13px] leading-normal"
      >
        {completed}张已清理完成 · {failed}张清理失败 · {running}张仍在清理
        {batch.unknownIds.length ? ` · ${batch.unknownIds.length}张待核对` : ''}
        {batch.unsentIds.length ? ` · ${batch.unsentIds.length}张尚未提交` : ''}
      </p>
      <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
        只有已全部清理的{completed}
        张移出回收站。失败和执行中的记录继续保留。受理失败的{rejected}
        张未进入任务。
      </p>
      <Card className="gap-0 rounded-2xl border border-border bg-background px-3 py-2 shadow-none md:px-5 dark:bg-surface">
        <Card.Content className="p-0">
          <dl data-testid="trash-batch-result-summary">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid min-h-18 content-start py-2 text-sm leading-normal md:grid-cols-3 md:content-center md:items-center md:gap-4 md:py-0"
              >
                <dt>{row.label}</dt>
                <dd>
                  {row.count}张
                  <span className="md:hidden"> · {row.detail}</span>
                </dd>
                <dd className="hidden md:block">{row.detail}</dd>
              </div>
            ))}
          </dl>
        </Card.Content>
      </Card>
      {batch.pending ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner size="sm" />
          正在提交并核对实际清理任务…
        </p>
      ) : null}
      {workspace.message ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>{workspace.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {batch.unresolved ? (
        <Button
          data-testid="trash-batch-check"
          variant="outline"
          className="h-12 w-fit rounded-lg"
          isDisabled={batch.pending}
          onPress={batch.check}
        >
          核对已发送结果 · {batch.unknownIds.length}张
        </Button>
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
      {batch.unsentIds.length || batch.failedIds.length ? (
        <Button
          data-testid="trash-batch-retry"
          className="h-12 w-fit rounded-lg"
          isDisabled={batch.pending || batch.unresolved}
          onPress={batch.retry}
        >
          继续未提交和受理失败项 ·{' '}
          {batch.unsentIds.length + batch.failedIds.length}张
        </Button>
      ) : null}
      {batch.failedTaskIds.length ? (
        <Button
          data-testid="trash-batch-retry-cleanup"
          variant="outline"
          className="h-12 w-fit rounded-lg"
          isDisabled={batch.pending || batch.unresolved}
          onPress={batch.retryTasks}
        >
          重试剩余对象 · {batch.failedTaskIds.length}张
        </Button>
      ) : null}
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
      <Button
        className={footerButton}
        isDisabled
        onPress={batch.toggleFailures}
      >
        查看失败明细
      </Button>
    </div>
  );
}
