'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Modal } from '@heroui/react/modal';
import { ArrowLeft } from 'lucide-react';
import { BatchThumbnail } from './batch-targets';
import { bytesLabel } from './detail-labels';
import type { LibraryBatch } from './use-library-batch';

function failureRetrySucceeded(batch: LibraryBatch) {
  const workspace = batch.workspace;
  return (
    !!workspace &&
    (workspace.action === 'public' || workspace.action === 'private') &&
    workspace.retrySource === 'failures' &&
    !batch.pending &&
    !batch.unresolved &&
    !workspace.unknownIds.length &&
    !workspace.unsentIds.length &&
    workspace.items.length > 0 &&
    workspace.results.length === workspace.items.length &&
    workspace.results.every((result) => result.status !== 'failed')
  );
}

const footerButton =
  'h-12 min-h-12 min-w-0 flex-1 rounded-lg font-normal md:w-50 md:flex-none';

export function BatchSummary({ batch }: { batch: LibraryBatch }) {
  const router = useRouter();
  const title = useRef<HTMLHeadingElement>(null);
  const failuresTitle = useRef<HTMLHeadingElement>(null);
  const workspace = batch.workspace;
  useEffect(() => {
    if (!batch.visible) return;
    (batch.showFailures ? failuresTitle : title).current?.focus({
      preventScroll: true,
    });
  }, [batch.visible, batch.showFailures, workspace?.phase]);
  if (!workspace) return null;
  const changed = workspace.results.filter(
    (result) => result.status === 'changed',
  ).length;
  const unchanged = workspace.results.filter(
    (result) => result.status === 'unchanged',
  ).length;
  const failures = workspace.results.filter(
    (result) => result.status === 'failed',
  );
  const restoring = workspace.action === 'restore';
  const recycling = workspace.action === 'trash';
  const changingVisibility =
    workspace.action === 'public' || workspace.action === 'private';
  const visibility = workspace.action === 'public' ? '公开' : '私有';
  const visibilityReturn = batch.returnLabel;
  const byId = new Map(workspace.items.map((item) => [item.id, item]));
  const stopped = restoring
    ? workspace.results.filter(
        (result) =>
          result.status !== 'failed' && !byId.get(result.id)!.storage.enabled,
      ).length
    : 0;
  const returnLabel = restoring ? '返回回收站' : batch.returnLabel;
  const allRecycled =
    recycling &&
    !batch.pending &&
    !workspace.unsentIds.length &&
    !failures.length &&
    workspace.results.length === workspace.items.length;
  if (failureRetrySucceeded(batch))
    return (
      <Modal
        isOpen
        onOpenChange={(open) => {
          if (!open) batch.close();
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              data-testid="library-batch"
              data-batch-view="retry-success"
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 dark:bg-surface"
            >
              <Modal.Header className="p-0">
                <Modal.Heading className="text-xl font-medium">
                  {changed + unchanged}张图片已设为{visibility}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="m-0 grid gap-4 p-0">
                <p className="text-sm">失败项重试成功。</p>
                <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
                  {batch.hasRemainingSelection
                    ? '本次重试的项目已移出选择，其余选择仍保留。'
                    : '本次选择已清空。'}
                </p>
              </Modal.Body>
              <Modal.Footer className="m-0 grid w-full grid-cols-1 justify-stretch gap-4 p-0">
                <Button
                  data-testid="batch-done"
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={batch.close}
                >
                  {visibilityReturn}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  if (changingVisibility && batch.showFailures && !batch.pending) {
    const retained = failures.filter((result) =>
      batch.failedIds.includes(result.id),
    );
    const current = retained.filter(
      (result) => byId.get(result.id)!.inCurrentPage,
    ).length;
    const sample = byId.get(retained[0]?.id ?? failures[0]?.id ?? '');
    return (
      <section
        data-testid="library-batch"
        data-batch-view="retained"
        aria-labelledby="batch-failures-title"
        className="grid min-w-0 gap-3 md:gap-4"
      >
        <Button
          data-testid="batch-return"
          variant="ghost"
          className="h-11 w-fit gap-1 rounded-lg bg-transparent p-0 text-xs font-normal text-muted hover:bg-transparent data-[pressed=true]:bg-transparent"
          onPress={batch.close}
        >
          <ArrowLeft size={14} aria-hidden />
          {visibilityReturn}
        </Button>
        <h1
          ref={failuresTitle}
          id="batch-failures-title"
          tabIndex={-1}
          className="text-[28px] font-medium leading-normal md:text-[30px]"
        >
          保留{retained.length}张失败项
        </h1>
        <p
          role="status"
          data-testid="batch-summary"
          className="text-[13px] leading-normal"
        >
          当前页{current}张 · 其他页{retained.length - current}张
        </p>
        {sample ? (
          <div className="flex min-w-0 items-center gap-3 md:gap-6">
            <span className="[&>span]:h-15 [&>span]:w-20 [&>span]:rounded-lg md:[&>span]:h-21 md:[&>span]:w-28">
              <BatchThumbnail
                key={sample.thumbnailUrl}
                url={sample.storage.enabled ? sample.thumbnailUrl : null}
              />
            </span>
            <div className="min-w-0 text-[13px] leading-normal [overflow-wrap:anywhere]">
              <p>{sample.displayName}</p>
              <p>
                原图 ·{' '}
                {typeof sample.byteSize === 'number'
                  ? bytesLabel(sample.byteSize)
                  : '大小待核对'}
              </p>
            </div>
          </div>
        ) : null}
        <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
          仅重试这{retained.length}张，已成功项目不会再次提交。
        </p>
        {workspace.message ? (
          <p role="alert" className="text-sm">
            {workspace.message}
          </p>
        ) : null}
        <Card className="gap-0 rounded-2xl border border-border bg-background px-3 py-2 shadow-none md:px-5 dark:bg-surface">
          <Card.Content className="p-0">
            <ul data-testid="batch-results">
              {failures.map((result) => {
                const item = byId.get(result.id)!;
                const valid = batch.failedIds.includes(result.id);
                return (
                  <li
                    key={result.id}
                    data-batch-result-id={result.id}
                    data-result-status="failed"
                    className="grid min-h-18 min-w-0 content-start py-2 text-sm leading-normal md:grid-cols-3 md:content-center md:items-center md:gap-4 md:py-0"
                  >
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p>{item.displayName}</p>
                      <p className="text-xs text-muted">{item.id}</p>
                    </div>
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      {item.source}
                      <span className="md:hidden"> · {result.message}</span>
                    </p>
                    <p className="hidden min-w-0 [overflow-wrap:anywhere] md:block">
                      {result.message}
                    </p>
                    {!valid ? (
                      <p className="text-xs text-muted md:col-span-3">
                        已删除或离开本次查询，已移除选择
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card.Content>
        </Card>
      </section>
    );
  }
  if (allRecycled)
    return (
      <Modal
        isOpen
        onOpenChange={(open) => {
          if (!open) batch.close();
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              data-testid="library-batch"
              aria-busy={batch.pending}
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 dark:bg-surface"
            >
              <Modal.Header className="p-0">
                <Modal.Heading className="text-xl font-medium">
                  图片已移入回收站
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="m-0 grid gap-4 p-0">
                <p className="text-sm">
                  {changed}张已回收 · {unchanged}张无需修改。内容链接已关闭。
                </p>
                <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
                  已完成的项目已移出选择。你可以在回收站恢复图片；文件仍占用空间，不会自动清理。
                </p>
              </Modal.Body>
              <Modal.Footer className="m-0 grid w-full grid-cols-1 justify-stretch gap-4 p-0">
                <Button
                  data-testid="batch-done"
                  variant="outline"
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={batch.close}
                >
                  {returnLabel}
                </Button>
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={() => router.push('/trash')}
                >
                  前往回收站
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  const heading = batch.pending
    ? '正在执行批量操作…'
    : workspace.unsentIds.length
      ? '本次操作尚未完成'
      : restoring
        ? `恢复完成${failures.length ? '，部分未恢复' : ''}`
        : `批量操作完成${failures.length ? `，${failures.length}张失败` : ''}`;
  const rows = restoring
    ? [
        {
          key: 'restored',
          label: '已恢复',
          count: changed + unchanged - stopped,
          description: '沿用 ID、权限与幸存关系',
          outcome: '已移出选择',
        },
        {
          key: 'restored-disabled',
          label: '记录已恢复',
          count: stopped,
          description: '存储停用，内容暂不可访问',
          outcome: '已移出选择',
        },
        {
          key: 'failed',
          label: '未恢复',
          count: failures.length,
          description: '查看逐项原因',
          outcome: `${batch.failedIds.length}张仍属当前查询，保留选择`,
        },
      ]
    : [
        {
          key: 'changed',
          label: `${changed}张`,
          count: changed,
          description: recycling ? '已移入回收站' : `已改为${visibility}`,
          outcome: '成功',
        },
        {
          key: 'unchanged',
          label: `${unchanged}张`,
          count: unchanged,
          description: recycling ? '当前已在回收站' : `当前已${visibility}`,
          outcome: '无需修改 / 核对成功',
        },
        {
          key: 'failed',
          label: `${failures.length}张`,
          count: failures.length,
          description: '操作失败',
          outcome: `${batch.failedIds.length}张保留选择，可重试`,
        },
      ];
  if (workspace.unsentIds.length)
    rows.push({
      key: 'unsent',
      label: restoring ? '尚未提交' : `${workspace.unsentIds.length}张`,
      count: workspace.unsentIds.length,
      description: '尚未提交',
      outcome: '选择已保留',
    });
  const sample =
    (recycling
      ? byId.get(failures.find((result) => result.inQuery)?.id ?? '')
      : undefined) ?? workspace.items[0];
  const sampleResult = workspace.results.find(
    (result) => result.id === sample?.id,
  );
  const samplePreview =
    sample?.storage.enabled &&
    (!recycling ||
      !sampleResult ||
      (sampleResult.status === 'failed' && sampleResult.inQuery))
      ? sample.thumbnailUrl
      : null;
  return (
    <section
      data-testid="library-batch"
      aria-busy={batch.pending}
      aria-labelledby="batch-title"
      className="grid min-w-0 gap-3 md:gap-4"
    >
      <Button
        data-testid="batch-return"
        variant="ghost"
        className="h-11 w-fit gap-1 rounded-lg bg-transparent p-0 text-xs font-normal text-muted hover:bg-transparent data-[pressed=true]:bg-transparent"
        isDisabled={batch.pending}
        onPress={batch.close}
      >
        <ArrowLeft size={14} aria-hidden />
        {returnLabel}
      </Button>
      <h1
        ref={title}
        id="batch-title"
        tabIndex={-1}
        className="text-[28px] font-medium leading-normal md:text-[30px]"
      >
        {heading}
      </h1>
      <p
        role="status"
        data-testid="batch-summary"
        className="text-[13px] leading-normal"
      >
        {workspace.items.length}张 · {changed}张
        {restoring ? '已恢复' : '已修改'} · {unchanged}张无需修改 ·{' '}
        {failures.length}张失败
        {workspace.unsentIds.length
          ? ` · ${workspace.unsentIds.length}张尚未提交`
          : ''}
      </p>
      {!restoring && sample ? (
        <div className="flex min-w-0 items-center gap-3 md:gap-6">
          <span className="[&>span]:h-15 [&>span]:w-20 [&>span]:rounded-lg md:[&>span]:h-21 md:[&>span]:w-28">
            <BatchThumbnail key={sample.thumbnailUrl} url={samplePreview} />
          </span>
          <div className="min-w-0 text-[13px] leading-normal [overflow-wrap:anywhere]">
            <p>{sample.displayName}</p>
            <p>
              原图 ·{' '}
              {typeof sample.byteSize === 'number'
                ? bytesLabel(sample.byteSize)
                : '大小待核对'}
            </p>
          </div>
        </div>
      ) : null}
      <div className="rounded-lg bg-default p-3 text-[13px] leading-normal">
        <p>已成功和无需修改的项目已移出选择。</p>
        <p>
          仍属当前查询的{batch.failedIds.length}
          张失败项保留选择，包含其他页；已删除或离开查询的失败项只保留结果说明。
        </p>
        {restoring && stopped ? (
          <p>{stopped}张停用存储记录已恢复，内容暂不可访问。</p>
        ) : null}
      </div>
      {workspace.message ? (
        <p role="alert" className="text-sm">
          {workspace.message}
        </p>
      ) : null}
      <Card className="gap-0 rounded-2xl border border-border bg-background px-3 py-2 shadow-none md:px-5 dark:bg-surface">
        <Card.Content className="p-0">
          <dl data-testid="batch-result-summary">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid min-h-18 content-start gap-0 py-2 text-sm leading-normal md:grid-cols-3 md:content-center md:items-center md:gap-4 md:py-0"
              >
                <dt>{row.label}</dt>
                <dd>
                  {restoring ? `${row.count}张` : row.description}
                  <span className="md:hidden">
                    {' '}
                    · {restoring ? row.description : row.outcome}
                  </span>
                </dd>
                <dd className="hidden md:block">
                  {restoring ? row.description : row.outcome}
                </dd>
              </div>
            ))}
          </dl>
        </Card.Content>
      </Card>
      {workspace.unsentIds.length && !batch.showFailures ? (
        <Button
          data-testid="batch-retry"
          className="h-12 w-fit rounded-lg font-normal"
          isDisabled={batch.pending}
          onPress={batch.retry}
        >
          继续处理剩余项 · {batch.failedIds.length + workspace.unsentIds.length}
          张
        </Button>
      ) : null}
      {batch.showFailures ? (
        <section
          aria-labelledby="batch-failures-title"
          className="grid min-w-0 gap-3"
        >
          <h2
            ref={failuresTitle}
            tabIndex={-1}
            id="batch-failures-title"
            className="text-xl font-medium"
          >
            失败项 · {failures.length}张
          </h2>
          <ul data-testid="batch-results" className="grid gap-3">
            {failures.map((result) => {
              const item = byId.get(result.id)!;
              return (
                <li
                  key={result.id}
                  data-batch-result-id={result.id}
                  data-result-status="failed"
                  className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-background p-3 dark:bg-surface"
                >
                  <BatchThumbnail
                    key={item.thumbnailUrl}
                    url={item.storage.enabled ? item.thumbnailUrl : null}
                  />
                  <div className="grid min-w-0 gap-1 text-sm [overflow-wrap:anywhere]">
                    <p>{item.displayName}</p>
                    <p className="text-xs text-muted">
                      {item.id} · {item.source}
                    </p>
                    <p>{result.message}</p>
                    <p className="text-xs text-muted">
                      {result.inQuery
                        ? '仍属当前查询，保留选择'
                        : '已删除或离开本次查询，已移除选择'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {batch.failedIds.length || workspace.unsentIds.length ? (
            <Button
              data-testid="batch-retry"
              className="h-12 w-fit rounded-lg font-normal"
              isDisabled={batch.pending}
              onPress={batch.retry}
            >
              重试有效失败项和未提交项 ·{' '}
              {batch.failedIds.length + workspace.unsentIds.length}张
            </Button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export function BatchSummaryFooter({ batch }: { batch: LibraryBatch }) {
  const workspace = batch.workspace;
  if (!workspace) return null;
  if (failureRetrySucceeded(batch)) return null;
  if (
    (workspace.action === 'public' || workspace.action === 'private') &&
    batch.showFailures &&
    !batch.pending
  ) {
    return (
      <div className="flex w-full gap-3 md:justify-end">
        <Button
          data-testid="batch-done"
          variant="outline"
          className={footerButton}
          onPress={batch.close}
        >
          {batch.returnLabel}
        </Button>
        <Button
          data-testid="batch-retry"
          className={footerButton}
          isDisabled={!batch.failedIds.length || batch.unresolved}
          onPress={batch.retryFailures}
        >
          重试设为{workspace.action === 'public' ? '公开' : '私有'}
        </Button>
      </div>
    );
  }
  const failed = workspace.results.filter(
    (result) => result.status === 'failed',
  ).length;
  if (
    workspace.action === 'trash' &&
    !batch.pending &&
    !failed &&
    !workspace.unsentIds.length &&
    workspace.results.length === workspace.items.length
  )
    return null;
  const restoring = workspace.action === 'restore';
  const returnButton = (
    <Button
      data-testid="batch-done"
      variant={restoring ? 'outline' : 'primary'}
      className={footerButton}
      isDisabled={batch.pending}
      onPress={batch.close}
    >
      {restoring ? '返回回收站' : batch.returnLabel}
    </Button>
  );
  const failureButton = (
    <Button
      data-testid="batch-view-failures"
      variant={restoring ? 'primary' : 'outline'}
      className={footerButton}
      isDisabled={(!batch.showFailures && !failed) || batch.pending}
      onPress={batch.toggleFailures}
    >
      {batch.showFailures ? '返回结果概要' : '查看失败项'}
    </Button>
  );
  return (
    <div className="flex w-full gap-3 md:justify-end">
      {restoring ? returnButton : failureButton}
      {restoring ? failureButton : returnButton}
    </div>
  );
}
