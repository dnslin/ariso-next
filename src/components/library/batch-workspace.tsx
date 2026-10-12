'use client';

import { useEffect, useRef } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { CloseButton } from '@heroui/react/close-button';
import { ArrowLeft, Check } from 'lucide-react';
import { BatchSummary, BatchSummaryFooter } from './batch-summary';
import { BatchTargets, BatchThumbnail } from './batch-targets';
import { BatchTagDrawer } from './batch-tag-drawer';
import { batchLabels, type LibraryBatch } from './use-library-batch';

const buttonClass = 'h-11 min-h-11 rounded-lg font-normal';
function targetDescription(batch: LibraryBatch) {
  const command = batch.workspace?.command;
  return command && 'albumIds' in command
    ? `相册 ${command.albumIds.join('、')}`
    : command && 'tagIds' in command
      ? `标签 ${command.tagIds.join('、')}`
      : '';
}

export function BatchWorkspaceContent({
  batch,
  client,
  currentAlbumId,
}: {
  batch: LibraryBatch;
  client: QueryClient;
  currentAlbumId?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = batch.workspace;
  useEffect(() => {
    if (batch.visible) heading.current?.focus({ preventScroll: true });
  }, [batch.visible, workspace?.phase, batch.showFailures]);
  if (!workspace || !batch.visible) return null;
  if (workspace.action.endsWith('tags'))
    return <BatchTagDrawer batch={batch} client={client} />;
  const label = batchLabels[workspace.action];
  const changed = workspace.results.filter(
    (result) => result.status === 'changed',
  ).length;
  const unchanged = workspace.results.filter(
    (result) => result.status === 'unchanged',
  ).length;
  const failed = workspace.results.filter(
    (result) => result.status === 'failed',
  ).length;
  if (workspace.phase !== 'result')
    return (
      <Modal
        isOpen
        onOpenChange={(open) => {
          if (!open) batch.close();
        }}
      >
        <Modal.Backdrop
          isDismissable={!batch.pending}
          isKeyboardDismissDisabled={batch.pending}
        >
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              data-testid="library-batch"
              data-batch-phase={workspace.phase}
              data-batch-action={workspace.action}
              render={(props) => (
                <section {...props} aria-busy={batch.pending} />
              )}
              className={`mx-0 my-auto flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full flex-col gap-4 overflow-hidden rounded-xl border border-border bg-background p-5 dark:bg-surface ${workspace.phase === 'choose' ? 'max-w-160' : 'max-w-120'}`}
            >
              <Modal.Header className="flex flex-row items-center justify-between gap-3 p-0 text-left">
                <Modal.Heading className="text-xl font-medium">
                  {workspace.phase === 'choose'
                    ? label
                    : workspace.action === 'remove-albums'
                      ? `从当前相册移出 ${workspace.items.length} 张图片？`
                      : workspace.action === 'restore'
                        ? `恢复已选${workspace.items.length}张?`
                        : `将${workspace.items.length}张图片${workspace.action === 'trash' ? '移入回收站' : label}?`}
                </Modal.Heading>
                <CloseButton
                  aria-label="关闭批量操作"
                  isDisabled={batch.pending}
                  onPress={batch.close}
                  className="size-11 shrink-0 bg-transparent"
                />
              </Modal.Header>
              <Modal.Body className="m-0 grid min-h-0 gap-3 overflow-y-auto p-0 text-foreground">
                {workspace.phase === 'choose' ? (
                  <BatchTargets batch={batch} client={client} />
                ) : (
                  <>
                    <p className="text-sm">
                      共选 {workspace.items.length} 张：当前页{' '}
                      {workspace.currentCount} 张，其他页{' '}
                      {workspace.items.length - workspace.currentCount} 张。
                    </p>
                    <p className="text-sm text-muted">
                      {workspace.action === 'remove-albums'
                        ? '只从当前相册移出，图片仍保留在图库和其他相册。'
                        : workspace.action === 'restore'
                          ? '逐项恢复仍可恢复的记录。存储停用时可恢复记录，但内容仍不可访问；正在删除或清理失败的记录不可恢复。'
                          : workspace.action === 'trash'
                            ? '逐项移入回收站。文件仍占用空间，不会自动清理；原 ID、可见性和关系会保留。'
                            : `仅修改这 ${workspace.items.length} 张${workspace.action === 'public' ? '私有' : '公开'}图片。`}
                    </p>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer className="m-0 flex w-full shrink-0 justify-end gap-3 p-0">
                <Button
                  data-testid="batch-return"
                  variant="outline"
                  className="h-12 w-24 shrink-0 rounded-lg font-normal"
                  isDisabled={batch.pending}
                  onPress={batch.close}
                >
                  取消
                </Button>
                <Button
                  data-testid="batch-submit"
                  className="h-12 min-w-0 rounded-lg font-normal"
                  isDisabled={
                    batch.pending ||
                    !workspace.command ||
                    (workspace.phase === 'choose' && !batch.targetReady)
                  }
                  onPress={batch.submit}
                >
                  {batch.pending ? '正在保存…' : `确认${label}`}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  if (
    workspace.phase === 'result' &&
    !workspace.action.endsWith('albums') &&
    !workspace.action.endsWith('tags') &&
    !batch.unresolved
  )
    return <BatchSummary batch={batch} />;
  const retained = batch.showFailures && !batch.unresolved && !batch.pending;
  const displayedItems = retained
    ? workspace.items.filter((item) => batch.failedIds.includes(item.id))
    : workspace.items;
  const title = retained
    ? `仍选中${displayedItems.length}张失败图片`
    : batch.pending
      ? batch.unresolved
        ? '正在核对实际状态'
        : '正在处理已选图片'
      : batch.unresolved
        ? workspace.checkFailed
          ? '暂时无法核对结果'
          : '操作结果待核对'
        : workspace.retrying
          ? failed
            ? `重试后仍有${failed}张失败`
            : '重试完成'
          : `${label}${failed ? ` · ${failed}张失败` : ' · 操作完成'}`;
  const results = new Map(
    workspace.results.map((result) => [result.id, result]),
  );
  return (
    <section
      data-testid="library-batch"
      aria-busy={batch.pending}
      className="grid min-w-0 gap-3"
      aria-labelledby="batch-title"
    >
      <Button
        data-testid="batch-return"
        variant="outline"
        className={`${buttonClass} w-45 md:w-55`}
        isDisabled={batch.pending}
        onPress={retained ? batch.toggleFailures : batch.close}
      >
        <ArrowLeft size={16} aria-hidden />
        {retained
          ? '返回操作结果'
          : workspace.action === 'restore'
            ? '返回回收站'
            : currentAlbumId
              ? '返回相册内容'
              : '返回图库'}
      </Button>
      <h1
        ref={heading}
        id="batch-title"
        tabIndex={-1}
        className="text-[23px] font-normal leading-normal md:text-[30px]"
      >
        {title}
      </h1>
      <>
        <p role="status" className="text-sm text-muted">
          {retained ? (
            `${currentAlbumId ? '相册内容' : '图库'} · 失败项来自${[...new Set(displayedItems.map((item) => item.source))].join('、')}`
          ) : (
            <>
              {workspace.retrying ? '本次重试' : ''}
              {workspace.items.length}张 · {changed}已修改 · {unchanged}
              无需修改 · {failed}失败{batch.pending ? ' · 正在处理…' : ''}
              {workspace.unknownIds.length
                ? ` · ${workspace.unknownIds.length}待核对`
                : ''}
              {workspace.unsentIds.length
                ? ` · ${workspace.unsentIds.length}未提交`
                : ''}
            </>
          )}
        </p>
        <p className="text-sm">
          {retained
            ? '继续原操作：'
            : workspace.retrying
              ? '原操作：'
              : '本次操作：'}
          {label}
          {targetDescription(batch) ? ` · ${targetDescription(batch)}` : ''}
        </p>
        {workspace.message ? (
          <p role="alert" className="text-sm">
            {workspace.message}
          </p>
        ) : null}
        <ul data-testid="batch-results" className="grid gap-3">
          {displayedItems.map((item) => {
            const result = results.get(item.id);
            const unknown = workspace.unknownIds.includes(item.id);
            const stillSelected =
              retained ||
              (workspace.retrying &&
                !batch.pending &&
                !batch.unresolved &&
                batch.failedIds.includes(item.id));
            const status = unknown
              ? '结果待核对'
              : result
                ? {
                    changed: '已修改',
                    unchanged: '无需修改',
                    accepted: '任务已受理',
                    unknown: '结果待核对',
                    failed: workspace.retrying ? '再次失败' : '失败',
                  }[result.status]
                : workspace.unsentIds.includes(item.id)
                  ? '尚未提交'
                  : '正在处理';
            return (
              <li
                key={item.id}
                data-batch-result-id={item.id}
                data-result-status={unknown ? 'unknown' : result?.status}
                className={`flex min-w-0 items-center gap-3 rounded-xl border border-default p-2.5 ${stillSelected ? 'bg-default' : 'bg-surface'}`}
              >
                <BatchThumbnail
                  key={item.thumbnailUrl}
                  url={item.storage.enabled ? item.thumbnailUrl : null}
                />
                <div className="grid min-w-0 gap-px [overflow-wrap:anywhere]">
                  <p className="flex items-center gap-1 text-sm">
                    {stillSelected ? <Check size={14} aria-hidden /> : null}
                    {item.displayName}
                  </p>
                  <p
                    className={`text-xs ${!unknown && result?.status === 'failed' ? 'text-danger' : 'text-muted'}`}
                  >
                    {item.id} · {item.source} · {status}
                  </p>
                  <p className="text-xs text-muted">
                    {unknown
                      ? `目标：${targetDescription(batch) || label}`
                      : (result?.message ?? '等待逐项结果')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {retained ? (
          <p className="text-sm">
            只重试这{displayedItems.length}张，其余
            {workspace.items.length - displayedItems.length}
            张不会重复提交。
          </p>
        ) : workspace.retrying &&
          !batch.pending &&
          !batch.unresolved &&
          batch.failedIds.length ? (
          <p className="text-sm">
            {changed
              ? `本次已修改${changed}张图片。`
              : '本次没有修改任何图片。'}
            仍保留这{batch.failedIds.length}张勾选，你可以稍后再试。
          </p>
        ) : !batch.pending && !batch.unresolved ? (
          <p className="text-sm">
            仍匹配当前列表的图片保留选择；{batch.failedIds.length}
            张有效失败可重试，包含其他页。
            {failed > batch.failedIds.length
              ? `${failed - batch.failedIds.length}张已删除或离开查询的失败项已移出选择，原因仍保留。`
              : ''}
          </p>
        ) : null}
        {workspace.action === 'restore' ? (
          <p className="text-sm">
            恢复保留原
            ID、可见性、仍存在的关系及相册加入时间，不自动启用存储或重启处理。
          </p>
        ) : null}
      </>
    </section>
  );
}

export function BatchWorkspaceFooter({ batch }: { batch: LibraryBatch }) {
  const workspace = batch.workspace;
  if (!workspace || !batch.visible || workspace.phase !== 'result') return null;
  if (workspace.action.endsWith('tags')) return null;
  if (
    workspace.phase === 'result' &&
    !workspace.action.endsWith('albums') &&
    !workspace.action.endsWith('tags') &&
    !batch.unresolved
  )
    return <BatchSummaryFooter batch={batch} />;
  return (
    <div className="grid h-34 w-full content-start gap-2 xl:h-37">
      {batch.unresolved ? (
        <Button
          data-testid="batch-check"
          className={`${buttonClass} w-full`}
          isDisabled={batch.pending}
          onPress={batch.check}
        >
          {batch.pending
            ? '正在核对…'
            : workspace.checkFailed
              ? '再次核对'
              : `核对这${workspace.unknownIds.length}张的实际状态`}
        </Button>
      ) : workspace.unsentIds.length ||
        (batch.showFailures && batch.failedIds.length) ? (
        <Button
          data-testid="batch-retry"
          className={`${buttonClass} w-full`}
          isDisabled={batch.pending}
          onPress={batch.retry}
        >
          {batch.pending
            ? '正在处理…'
            : workspace.unsentIds.length
              ? `继续处理剩余项 · ${batch.failedIds.length + workspace.unsentIds.length}张`
              : `重试${batchLabels[workspace.action]} · ${batch.failedIds.length}张`}
        </Button>
      ) : batch.failedIds.length ? (
        <Button
          data-testid="batch-retained"
          className={`${buttonClass} w-full`}
          isDisabled={batch.pending}
          onPress={batch.toggleFailures}
        >
          {workspace.retrying
            ? `返回已选${batch.failedIds.length}张`
            : `查看保留的${batch.failedIds.length}张`}
        </Button>
      ) : (
        <Button
          data-testid="batch-done"
          className={`${buttonClass} w-full`}
          isDisabled={batch.pending}
          onPress={batch.close}
        >
          {batch.pending ? '正在处理…' : '完成并返回列表'}
        </Button>
      )}
    </div>
  );
}
