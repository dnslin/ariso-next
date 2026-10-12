'use client';

import { useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Drawer } from '@heroui/react/drawer';
import { X } from 'lucide-react';
import { BatchTargets } from './batch-targets';
import { batchLabels, type LibraryBatch } from './use-library-batch';

export function BatchTagDrawer({
  batch,
  client,
}: {
  batch: LibraryBatch;
  client: QueryClient;
}) {
  const [createBlocked, setCreateBlocked] = useState(false);
  const workspace = batch.workspace!;
  const label = batchLabels[workspace.action];
  const dismissBlocked = batch.pending || createBlocked || batch.unresolved;
  const choosing = workspace.phase === 'choose';
  const tagCount =
    workspace.command && 'tagIds' in workspace.command
      ? workspace.command.tagIds.length
      : 0;
  return (
    <Drawer.Backdrop
      isOpen={batch.visible}
      onOpenChange={(open) => {
        if (!open && !dismissBlocked) batch.close();
      }}
      isDismissable={!dismissBlocked}
      isKeyboardDismissDisabled={dismissBlocked}
      className="duration-200 motion-reduce:transition-none"
    >
      <Drawer.Content placement="right">
        <Drawer.Dialog
          data-testid="library-batch"
          data-batch-phase={workspace.phase}
          data-batch-action={workspace.action}
          className="h-full w-full max-w-full overflow-hidden border-l border-border bg-surface p-0 [--drawer-enter-duration:200ms] [--drawer-exit-duration:200ms] motion-reduce:transition-none sm:w-105 sm:max-w-full"
        >
          <Drawer.Header className="flex shrink-0 flex-row items-center justify-between gap-3 px-5 pt-3 pb-4">
            <div className="min-w-0">
              <Drawer.Heading className="text-lg font-semibold">
                {label}
              </Drawer.Heading>
              <p
                data-testid="batch-tag-image-count"
                role="status"
                className="mt-1 text-sm text-muted"
              >
                已选 {workspace.items.length} 张图片
              </p>
            </div>
            <Drawer.CloseTrigger
              aria-label="关闭批量操作"
              isDisabled={dismissBlocked}
              className="static size-11 min-h-11 min-w-11 shrink-0 rounded-lg bg-transparent p-0"
            >
              <X size={18} aria-hidden />
            </Drawer.CloseTrigger>
          </Drawer.Header>
          <Drawer.Body
            aria-busy={batch.pending}
            className="m-0 flex min-h-0 flex-col overflow-y-auto px-5 pt-0 pb-4 text-foreground"
          >
            <BatchTargets
              batch={batch}
              client={client}
              onCreateBlockedChange={setCreateBlocked}
            />
          </Drawer.Body>
          {!choosing ? <TagBatchResults batch={batch} /> : null}
          <Drawer.Footer className="m-0 shrink-0 gap-2 border-t border-border px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            {choosing ? (
              <span
                data-testid="batch-tag-count"
                role="status"
                className="mr-auto text-sm text-muted"
              >
                已选 {tagCount} 个标签
              </span>
            ) : null}
            <Button
              data-testid="batch-return"
              variant="ghost"
              className="h-11 min-h-11 shrink-0 rounded-lg px-4 text-sm"
              isDisabled={dismissBlocked}
              onPress={batch.close}
            >
              {choosing ? '取消' : '关闭'}
            </Button>
            {choosing ? (
              <Button
                data-testid="batch-submit"
                className="h-11 min-h-11 rounded-lg px-5 text-sm"
                isDisabled={
                  batch.pending ||
                  createBlocked ||
                  !workspace.command ||
                  !batch.targetReady
                }
                onPress={batch.submit}
              >
                {batch.pending
                  ? '正在保存…'
                  : workspace.action === 'add-tags'
                    ? '添加'
                    : '移除'}
              </Button>
            ) : batch.unresolved ? (
              <Button
                data-testid="batch-check"
                className="h-11 min-h-11 rounded-lg px-4 text-sm"
                isDisabled={batch.pending}
                onPress={batch.check}
              >
                {batch.pending
                  ? '正在核对…'
                  : workspace.checkFailed
                    ? '再次核对'
                    : '核对实际状态'}
              </Button>
            ) : batch.failedIds.length || workspace.unsentIds.length ? (
              <Button
                data-testid="batch-retry"
                className="h-11 min-h-11 rounded-lg px-4 text-sm"
                isDisabled={batch.pending}
                onPress={batch.retry}
              >
                {batch.pending
                  ? '正在处理…'
                  : workspace.unsentIds.length
                    ? '继续处理剩余项'
                    : `重试 ${batch.failedIds.length} 张失败图片`}
              </Button>
            ) : (
              <Button
                data-testid="batch-done"
                className="h-11 min-h-11 rounded-lg px-4 text-sm"
                isDisabled={batch.pending}
                onPress={batch.close}
              >
                完成
              </Button>
            )}
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

export function TagBatchResults({ batch }: { batch: LibraryBatch }) {
  const workspace = batch.workspace!;
  const byId = new Map(workspace.results.map((result) => [result.id, result]));
  const changed = workspace.results.filter(
    (result) => result.status === 'changed',
  ).length;
  const failed = workspace.results.filter(
    (result) => result.status === 'failed',
  ).length;
  return (
    <section
      aria-label="标签操作结果"
      className="max-h-[30dvh] shrink-0 overflow-y-auto border-t border-border px-5 py-3 text-sm"
    >
      <p role="status" className="mb-2 text-muted">
        {changed} 张已修改 · {failed} 张失败
        {workspace.unknownIds.length
          ? ` · ${workspace.unknownIds.length} 张待核对`
          : ''}
        {workspace.unsentIds.length
          ? ` · ${workspace.unsentIds.length} 张未提交`
          : ''}
      </p>
      {workspace.message ? (
        <p role="alert" className="mb-2 text-danger">
          {workspace.message}
        </p>
      ) : null}
      <ul data-testid="batch-results" className="grid gap-2">
        {workspace.items.map((item) => {
          const result = byId.get(item.id);
          const unknown = workspace.unknownIds.includes(item.id);
          const status = unknown ? 'unknown' : result?.status;
          const description = unknown
            ? '结果待核对'
            : (result?.message ??
              (workspace.unsentIds.includes(item.id)
                ? '尚未提交'
                : '正在处理'));
          return (
            <li
              key={item.id}
              data-batch-result-id={item.id}
              data-result-status={status}
              className="grid gap-0.5 [overflow-wrap:anywhere]"
            >
              <span>{item.displayName}</span>
              <span
                className={`text-xs ${status === 'failed' ? 'text-danger' : 'text-muted'}`}
              >
                {description}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
