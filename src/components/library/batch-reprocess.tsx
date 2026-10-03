'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '@heroui/react/alert';
import { Chip } from '@heroui/react/chip';
import { Label } from '@heroui/react/label';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { Table } from '@heroui/react/table';
import { DetailReturn, DetailTip } from './detail-controls';
import { scopeLabels } from './detail-reprocess-result';
import { bytesLabel, stepLabels, versionLabels } from './detail-labels';
import { BatchThumbnail } from './batch-targets';
import type { BatchReprocess } from './use-batch-reprocess';
import { rowState, type ReprocessRow } from './batch-reprocess-state';
import { reprocessStatuses, reprocessSummary } from './batch-reprocess-status';

const scopes = ['all', 'compressed', 'thumbnail', 'watermark'] as const;
const scopeNames = {
  all: '全部派生',
  compressed: '压缩',
  thumbnail: '缩略图',
  watermark: '水印',
};
const scopeDescriptions = {
  all: '更新所有适用版本',
  compressed: '仅更新压缩版本',
  thumbnail: '仅更新缩略图',
  watermark: '仅更新水印版本',
};
const buttonClass =
  'h-12 min-h-12 min-w-0 w-full rounded-lg px-2 py-1 font-normal leading-5 whitespace-normal [overflow-wrap:anywhere] only:col-span-2 xl:w-50 xl:flex-none';
function ReprocessTip() {
  return (
    <DetailTip label="处理说明">
      <p>每张图片受理时使用最新设置；之后修改设置不影响已受理任务。</p>
      <p>
        首次处理失败只支持全部派生。局部处理不会自动扩大范围，不适用图片会单独显示原因。
      </p>
      <p>
        已受理任务在后台继续执行，关闭页面不会取消；尚未提交项不会自动发送。
      </p>
      <p>处理中原图和已有版本继续可用，所选新版本全部成功后才替换。</p>
    </DetailTip>
  );
}
function TaskStatus({ row }: { row: ReprocessRow }) {
  const state = rowState(row);
  const { color, Icon, label } = reprocessStatuses[state];
  return (
    <Chip
      color={color}
      variant="soft"
      size="sm"
      className="max-w-full gap-1.5"
      data-testid="batch-task-status"
      data-state={state}
    >
      <Icon size={13} aria-hidden />
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
export function BatchReprocessContent({ batch }: { batch: BatchReprocess }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = batch.workspace;
  useEffect(() => {
    if (batch.visible && workspace?.phase === 'result')
      heading.current?.focus({ preventScroll: true });
  }, [workspace?.phase, batch.showFailures, batch.visible]);
  if (!workspace || !batch.visible) return null;
  const initialFailures = workspace.items.filter(
    (item) => item.processingStatus === 'failed',
  ).length;
  const failedOnly =
    workspace.items.length > 0 && initialFailures === workspace.items.length;
  if (workspace.phase === 'choose') {
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
              aria-busy={batch.pending}
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6"
            >
              <Modal.Header className="flex flex-row items-center justify-between gap-2 p-0">
                <Modal.Heading className="text-xl font-medium">
                  重新处理
                </Modal.Heading>
                <ReprocessTip />
              </Modal.Header>
              <Modal.Body className="m-0 grid gap-4 p-0 text-foreground">
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <p className="text-[13px] text-muted">
                    已选 {workspace.items.length} 张 · 当前页{' '}
                    {workspace.currentCount} 张
                    {workspace.items.length !== workspace.currentCount
                      ? ` · 其他页 ${workspace.items.length - workspace.currentCount} 张`
                      : ''}
                  </p>
                </div>
                <RadioGroup
                  aria-label="批量处理范围"
                  value={workspace.scope}
                  aria-describedby={
                    initialFailures ? 'batch-scope-restriction' : undefined
                  }
                  isDisabled={batch.pending}
                  onChange={(scope) =>
                    batch.choose(scope as typeof workspace.scope)
                  }
                  className="grid gap-2"
                >
                  {scopes.map((scope) => (
                    <Radio
                      key={scope}
                      value={scope}
                      data-testid={`batch-reprocess-scope-${scope}`}
                      isDisabled={failedOnly && scope !== 'all'}
                      className="group mt-0 min-w-0 data-[disabled=true]:opacity-100"
                    >
                      <Radio.Content
                        className={`min-h-16 w-full justify-start gap-3 rounded-xl border px-4 py-2.5 text-sm font-normal group-data-[disabled=true]:opacity-45 data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus ${workspace.scope === scope ? 'border-accent/60 bg-accent/5' : 'border-border bg-surface data-[hovered=true]:bg-default/40'}`}
                      >
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        <div className="min-w-0 text-left">
                          <Label className="text-sm font-medium">
                            {scopeLabels[scope]}
                          </Label>
                          <p className="mt-0.5 text-xs leading-4 text-muted">
                            {scopeDescriptions[scope]}
                          </p>
                        </div>
                      </Radio.Content>
                    </Radio>
                  ))}
                </RadioGroup>
                {initialFailures ? (
                  <p
                    data-testid="batch-scope-restriction"
                    id="batch-scope-restriction"
                    className="text-xs leading-5 text-muted"
                  >
                    {failedOnly
                      ? '首次处理失败，仅支持全部派生。'
                      : `${initialFailures} 张首次处理失败的图片仅支持全部派生；选择局部范围会显示冲突。`}
                  </p>
                ) : null}
              </Modal.Body>
              <Modal.Footer className="m-0 grid w-full grid-cols-[96px_minmax(0,1fr)] justify-stretch gap-3 border-t border-border pt-4 pb-0">
                <Button
                  data-testid="batch-return"
                  variant="outline"
                  className="h-12 w-full rounded-lg font-normal"
                  isDisabled={batch.pending}
                  onPress={batch.close}
                >
                  取消
                </Button>
                <Button
                  data-testid="batch-submit"
                  className="h-12 w-full rounded-lg font-normal"
                  isDisabled={batch.pending}
                  onPress={batch.submit}
                >
                  {batch.pending
                    ? '正在逐图受理…'
                    : `开始处理 · ${workspace.items.length}张`}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  }
  const rows = new Map(workspace.rows.map((row) => [row.id, row]));
  const accepted = workspace.rows.filter(
    (row) => row.outcome.state === 'accepted',
  );
  const rejected = workspace.rows.filter(
    (row) => row.outcome.state === 'rejected',
  );
  const succeeded = workspace.rows.filter(
    (row) => rowState(row) === 'succeeded',
  ).length;
  const executingFailed = workspace.rows.filter((row) => {
    const state = rowState(row);
    return state === 'failed' || state === 'cancelled';
  }).length;
  const active = accepted.length - succeeded - executingFailed;
  const mixedScopes = accepted.some(
    (row) => row.attempt.scope !== workspace.scope,
  );
  const displayed = batch.showFailures
    ? workspace.items.filter(
        (item) => reprocessStatuses[rowState(rows.get(item.id)!)].failure,
      )
    : workspace.items;
  const first =
    displayed.find((item) => item.thumbnailUrl && item.storage.enabled) ??
    displayed[0];
  const title =
    batch.unsentIds.length && !batch.unresolved
      ? '本次重处理尚未全部提交'
      : batch.unresolved
        ? '重处理结果待核对'
        : batch.showFailures
          ? '重处理失败项'
          : batch.pending
            ? '正在逐图受理重处理任务'
            : active
              ? `${mixedScopes ? '重处理' : scopeNames[workspace.scope]}任务已受理${rejected.length ? `，${rejected.length} 张冲突` : ''}`
              : executingFailed || rejected.length
                ? '重处理结果 · 存在失败项'
                : '重新处理完成';
  return (
    <section
      data-testid="library-batch"
      aria-busy={batch.pending}
      className="grid min-w-0 gap-3 xl:gap-4"
    >
      <DetailReturn onPress={batch.close}>{batch.returnLabel}</DetailReturn>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-[28px] font-medium leading-normal xl:text-[30px]"
        >
          {title}
        </h1>
        <ReprocessTip />
      </div>
      <div
        role="status"
        className="flex flex-wrap items-center gap-2 text-[13px]"
      >
        <span className="mr-1 text-muted">
          共 {workspace.items.length} 张
          {accepted.length ? ` · 任务已受理 ${accepted.length} 张` : ''}
        </span>
        {reprocessSummary(workspace.rows).map((item) => (
          <Chip key={item.label} color={item.color} variant="soft" size="sm">
            <Chip.Label>
              {item.label} {item.count} 张
            </Chip.Label>
          </Chip>
        ))}
      </div>
      {first ? (
        <div className="flex min-w-0 items-center gap-3 text-[13px] xl:gap-6">
          <BatchThumbnail
            url={first.storage.enabled ? first.thumbnailUrl : null}
            className="h-15 w-20 rounded-lg xl:h-21 xl:w-28"
          />
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p>{first.displayName}</p>
            <p>
              原图 ·{' '}
              {first.byteSize === undefined
                ? '大小未知'
                : bytesLabel(first.byteSize)}
            </p>
          </div>
        </div>
      ) : null}
      {workspace.message ? (
        <p role="alert" className="text-sm [overflow-wrap:anywhere]">
          {workspace.message}
        </p>
      ) : null}
      {batch.progressError ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>读取进度失败</Alert.Title>
            <Alert.Description>
              {batch.progressError}。保留最后已知任务状态，任务继续执行。
            </Alert.Description>
            <Button
              data-testid="batch-progress-check"
              variant="outline"
              className="mt-3 min-h-11 rounded-lg"
              onPress={batch.checkProgress}
              isDisabled={batch.pending}
            >
              再次读取进度
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {batch.refreshError ? (
        <Alert status="danger" role="alert">
          <Alert.Content>
            <Alert.Title>列表刷新失败</Alert.Title>
            <Alert.Description>
              {batch.refreshError} 已确认的任务结果保留。
            </Alert.Description>
            <Button
              data-testid="batch-refresh-retry"
              variant="outline"
              className="mt-3 min-h-11 rounded-lg"
              onPress={batch.retryRefresh}
              isDisabled={batch.pending || batch.refreshPending}
            >
              {batch.refreshPending ? '正在刷新列表…' : '重新刷新列表'}
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      <Table
        variant="secondary"
        className="rounded-2xl border border-border bg-surface px-3 py-2 shadow-none xl:px-5"
      >
        <Table.Content
          aria-label="逐图重处理结果"
          className="w-full table-fixed"
        >
          <Table.Header className="sr-only">
            <Table.Column isRowHeader>图片</Table.Column>
            <Table.Column>任务状态</Table.Column>
            <Table.Column>处理范围与结果</Table.Column>
          </Table.Header>
          <Table.Body items={displayed} dependencies={[workspace.rows]}>
            {(item) => {
              const row = rows.get(item.id)!;
              const result =
                row.outcome.state === 'accepted' ||
                row.outcome.state === 'rejected'
                  ? row.outcome.result
                  : undefined;
              const task =
                row.outcome.state === 'accepted'
                  ? row.outcome.result.task
                  : undefined;
              return (
                <Table.Row
                  id={item.id}
                  data-batch-result-id={item.id}
                  data-result-status={
                    row.outcome.state === 'unknown' ? 'unknown' : result?.status
                  }
                  data-job-status={task?.status}
                  data-task-id={result?.taskId}
                  className="block min-h-18 py-3 xl:table-row xl:h-18"
                >
                  <Table.Cell className="block border-0 p-0 align-top text-sm [overflow-wrap:anywhere] xl:table-cell xl:w-1/3 xl:px-0 xl:py-3">
                    <p>{item.displayName}</p>
                    <p className="text-xs text-muted">
                      {item.source} · {item.id}
                    </p>
                  </Table.Cell>
                  <Table.Cell className="block border-0 p-0 pt-2 align-top text-sm [overflow-wrap:anywhere] xl:table-cell xl:w-1/3 xl:py-3">
                    <TaskStatus row={row} />
                    {result?.taskId ? (
                      <p className="mt-1.5 text-xs text-muted">
                        任务 {result.taskId}
                      </p>
                    ) : null}
                    {task?.status === 'running' ? (
                      <p className="text-xs text-muted">
                        {stepLabels[task.step] ?? task.step} · 已生成{' '}
                        {task.generatedVersions.length}/
                        {task.expectedVersions.length} 项候选
                      </p>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell className="block border-0 p-0 align-top text-sm [overflow-wrap:anywhere] xl:table-cell xl:w-1/3 xl:py-3">
                    <p>{scopeLabels[row.attempt.scope]}</p>
                    <p className="text-xs text-muted">
                      {task?.error ?? result?.message ?? '等待逐项结果'}
                    </p>
                    {task?.status === 'succeeded' ? (
                      <p className="text-xs text-muted">
                        已更新：
                        {task.expectedVersions
                          .map((kind) => versionLabels[kind])
                          .join('、')}
                      </p>
                    ) : null}
                    {row.outcome.state === 'accepted' &&
                    reprocessStatuses[rowState(row)].failure ? (
                      <p className="text-xs text-muted">
                        原图和已有版本保留；已受理时移出选择。
                      </p>
                    ) : null}
                    {result?.status === 'failed' ? (
                      <p className="text-xs text-muted">
                        {result.inQuery
                          ? '仍属于本次查询，保留现有选择。'
                          : '已离开本次查询，已移出选择。'}
                      </p>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              );
            }}
          </Table.Body>
        </Table.Content>
      </Table>
    </section>
  );
}

export function BatchReprocessFooter({ batch }: { batch: BatchReprocess }) {
  const workspace = batch.workspace;
  if (!workspace || workspace.phase === 'choose') return null;
  const failedTasks = workspace.rows.filter(
    (row) =>
      row.outcome.state === 'accepted' &&
      reprocessStatuses[rowState(row)].failure &&
      row.outcome.result.inQuery,
  );
  const failedScopes = scopes.filter((scope) =>
    failedTasks.some((row) => row.attempt.scope === scope),
  );
  const failures = workspace.rows.some(
    (row) => reprocessStatuses[rowState(row)].failure,
  );
  return (
    <div className="grid w-full grid-cols-2 gap-3 xl:flex xl:flex-wrap xl:justify-end">
      <Button
        data-testid="batch-done"
        variant="outline"
        className={buttonClass}
        isDisabled={batch.pending}
        onPress={batch.close}
      >
        {batch.returnLabel}
      </Button>
      {batch.unresolved ? (
        <Button
          data-testid="batch-check"
          className={buttonClass}
          isDisabled={batch.pending}
          onPress={batch.check}
        >
          {batch.pending
            ? '正在核对…'
            : `核对这${batch.unknownIds.length}张的实际状态`}
        </Button>
      ) : (
        <>
          {batch.unsentIds.length ? (
            <Button
              data-testid="batch-retry"
              className={buttonClass}
              isDisabled={batch.pending}
              onPress={batch.retry}
            >
              继续处理剩余项 · {batch.unsentIds.length}张
            </Button>
          ) : null}
          {failures && !batch.showFailures ? (
            <Button
              data-testid="batch-retained"
              className={buttonClass}
              isDisabled={batch.pending}
              onPress={batch.toggleFailures}
            >
              查看冲突图片
            </Button>
          ) : null}
          {batch.showFailures ? (
            <>
              {batch.unsentIds.length ? (
                <p className="col-span-2 w-full text-[13px] text-muted">
                  请先按原范围继续处理剩余项，再选择其他范围重试失败项。
                </p>
              ) : null}
              <Button
                variant="outline"
                className={buttonClass}
                isDisabled={batch.pending}
                onPress={batch.toggleFailures}
              >
                返回全部结果
              </Button>
              {batch.failedIds.length ? (
                <Button
                  data-testid="batch-retry"
                  className={buttonClass}
                  isDisabled={batch.pending}
                  onPress={batch.retryFailures}
                >
                  重试未受理项 · {batch.failedIds.length}张
                </Button>
              ) : null}
              {workspace.rows.some(
                (row) =>
                  batch.failedIds.includes(row.id) &&
                  row.attempt.scope !== 'all',
              ) ? (
                <Button
                  data-testid="batch-retry-all"
                  className={buttonClass}
                  isDisabled={batch.pending || !!batch.unsentIds.length}
                  onPress={batch.retryFailuresAll}
                >
                  全部派生重试未受理项
                </Button>
              ) : null}
              {failedScopes.map((scope) => (
                <Button
                  key={scope}
                  data-testid="batch-task-retry"
                  data-retry-scope={scope}
                  className={buttonClass}
                  isDisabled={
                    batch.pending ||
                    workspace.rows.some(
                      (row) =>
                        row.outcome.state === 'unsent' &&
                        row.attempt.scope !== scope,
                    )
                  }
                  onPress={() => batch.retryTasks(scope)}
                >
                  重试{scopeNames[scope]}失败 ·{' '}
                  {
                    failedTasks.filter((row) => row.attempt.scope === scope)
                      .length
                  }
                  张
                </Button>
              ))}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
