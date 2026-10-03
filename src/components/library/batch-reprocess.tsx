'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '@heroui/react/alert';
import { Description } from '@heroui/react/description';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { Table } from '@heroui/react/table';
import type { BatchItemResult } from '../../server/library/batch-types';
import { DetailReturn } from './detail-controls';
import { scopeLabels } from './detail-reprocess-result';
import { bytesLabel, stepLabels, versionLabels } from './detail-labels';
import { BatchThumbnail } from './batch-targets';
import { batchFailedTaskIds, type LibraryBatch } from './use-library-batch';

const scopes = ['all', 'compressed', 'thumbnail', 'watermark'] as const;
const scopeNames = {
  all: '全部派生',
  compressed: '压缩',
  thumbnail: '缩略图',
  watermark: '水印',
};
const buttonClass =
  'h-12 min-h-12 min-w-0 w-full rounded-lg px-2 py-1 font-normal leading-5 whitespace-normal [overflow-wrap:anywhere] only:col-span-2 xl:w-50 xl:flex-none';
export function batchTaskStatus(result?: BatchItemResult) {
  if (!result) return '等待受理';
  if (result.status === 'unknown') return '结果待核对';
  if (result.status !== 'accepted')
    return result.status === 'failed' ? '未受理' : '无需修改';
  return {
    queued: '任务已受理 · 正在排队',
    running: '正在处理',
    succeeded: '处理完成',
    failed: '处理失败',
    cancelled: '任务已取消',
  }[result.task?.status ?? 'queued'];
}
export function BatchReprocessContent({ batch }: { batch: LibraryBatch }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = batch.workspace;
  useEffect(() => {
    if (workspace?.phase === 'result')
      heading.current?.focus({ preventScroll: true });
  }, [workspace?.phase, batch.showFailures]);
  if (!workspace || workspace.command?.type !== 'reprocess') return null;
  const command = workspace.command;
  const failedOnly =
    workspace.items.length > 0 &&
    workspace.items.every((item) => item.processingStatus === 'failed');
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
              <Modal.Header className="p-0">
                <Modal.Heading className="text-xl font-medium">
                  重新处理已选{workspace.items.length}张
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="m-0 grid gap-4 p-0 text-foreground">
                <p className="text-sm">
                  包含当前页 {workspace.currentCount} 张、其他页{' '}
                  {workspace.items.length - workspace.currentCount} 张。
                </p>
                <Alert className="rounded-lg bg-default p-3 text-[13px] shadow-none">
                  <Alert.Content>
                    <Alert.Description className="text-foreground">
                      每张图片受理时使用最新设置。首次失败只能全部派生；选择局部范围时会单独返回冲突，不会自动扩大范围。已有版本在处理中继续保留。
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
                <RadioGroup
                  aria-label="批量处理范围"
                  value={command.scope}
                  isDisabled={batch.pending}
                  onChange={(scope) =>
                    batch.choose({
                      ...command,
                      scope: scope as typeof command.scope,
                    })
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
                      <Radio.Content className="h-11 w-full justify-center gap-1 rounded-lg border border-border bg-background text-sm font-normal group-data-[disabled=true]:opacity-[.42] data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus">
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        {scopeLabels[scope]}
                        {failedOnly && scope !== 'all' ? ' · 不可选' : ''}
                        {command.scope === scope ? ' · 已选' : ''}
                      </Radio.Content>
                      {failedOnly && scope !== 'all' ? (
                        <Description className="ps-0 text-xs leading-[19px] text-muted opacity-100">
                          首次失败须处理全部
                        </Description>
                      ) : null}
                    </Radio>
                  ))}
                </RadioGroup>
              </Modal.Body>
              <Modal.Footer className="m-0 grid w-full grid-cols-1 justify-stretch gap-4 p-0">
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
                    : `开始${scopeLabels[command.scope]}重处理`}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  }
  const results = new Map(
    workspace.results.map((result) => [result.id, result]),
  );
  const accepted = workspace.results.filter(
    (result) => result.status === 'accepted',
  );
  const rejected = workspace.results.filter(
    (result) => result.status === 'failed',
  );
  const succeeded = accepted.filter(
    (result) => result.task?.status === 'succeeded',
  ).length;
  const executingFailed = accepted.filter(
    (result) =>
      result.task?.status === 'failed' || result.task?.status === 'cancelled',
  ).length;
  const active = accepted.length - succeeded - executingFailed;
  const mixedScopes = accepted.some(
    (result) => result.task.scope !== command.scope,
  );
  const displayed = batch.showFailures
    ? workspace.items.filter((item) => {
        const result = results.get(item.id);
        return (
          result?.status === 'failed' ||
          result?.task?.status === 'failed' ||
          result?.task?.status === 'cancelled'
        );
      })
    : workspace.items;
  const first =
    displayed.find((item) => item.thumbnailUrl && item.storage.enabled) ??
    displayed[0];
  const title =
    workspace.unsentIds.length && !batch.unresolved
      ? '本次重处理尚未全部提交'
      : batch.unresolved
        ? '重处理结果待核对'
        : batch.showFailures
          ? '重处理失败项'
          : batch.pending
            ? '正在逐图受理重处理任务'
            : active
              ? `${mixedScopes ? '重处理' : scopeNames[command.scope]}任务已受理${rejected.length ? `，${rejected.length} 张冲突` : ''}`
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
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-[28px] font-medium leading-normal xl:text-[30px]"
      >
        {title}
      </h1>
      <p role="status" className="text-[13px] leading-normal">
        {workspace.items.length} 张 · {accepted.length} 张任务已受理 · {active}{' '}
        张处理中 · {succeeded} 张完成 · {rejected.length} 张未受理 ·{' '}
        {executingFailed} 张处理失败
        {workspace.unknownIds.length
          ? ` · ${workspace.unknownIds.length} 张待核对`
          : ''}
        {workspace.unsentIds.length
          ? ` · ${workspace.unsentIds.length} 张尚未提交`
          : ''}
      </p>
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
      <Alert className="rounded-lg bg-default p-3 text-[13px] shadow-none">
        <Alert.Content>
          <Alert.Description className="text-foreground">
            任务受理不等于处理完成。首次处理失败的图片只能全部重处理，不会自动扩大本次范围。每张任务分别记录受理时的设置；关闭页面后已受理任务继续，尚未提交项不会自动发送。
          </Alert.Description>
        </Alert.Content>
      </Alert>
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
          <Table.Body
            items={displayed}
            dependencies={[
              workspace.results,
              workspace.unknownIds,
              workspace.unsentIds,
              command.scope,
            ]}
          >
            {(item) => {
              const result = results.get(item.id);
              const unknown = workspace.unknownIds.includes(item.id);
              const task = result?.task;
              return (
                <Table.Row
                  id={item.id}
                  data-batch-result-id={item.id}
                  data-result-status={unknown ? 'unknown' : result?.status}
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
                  <Table.Cell className="block border-0 p-0 align-top text-sm [overflow-wrap:anywhere] xl:table-cell xl:w-1/3 xl:py-3">
                    <p>
                      {unknown
                        ? '结果待核对'
                        : workspace.unsentIds.includes(item.id)
                          ? '尚未提交'
                          : batchTaskStatus(result)}
                    </p>
                    {result?.taskId ? (
                      <p className="text-xs text-muted">任务 {result.taskId}</p>
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
                    <p>{scopeLabels[task?.scope ?? command.scope]}</p>
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
                    {task?.status === 'failed' ||
                    task?.status === 'cancelled' ? (
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

export function BatchReprocessFooter({ batch }: { batch: LibraryBatch }) {
  const workspace = batch.workspace;
  if (!workspace || workspace.phase === 'choose') return null;
  const failedScopes = scopes.filter(
    (scope) => batchFailedTaskIds(workspace.results, scope).length > 0,
  );
  const failures = workspace.results.some(
    (result) =>
      result.status === 'failed' ||
      result.task?.status === 'failed' ||
      result.task?.status === 'cancelled',
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
            : `核对这${workspace.unknownIds.length}张的实际状态`}
        </Button>
      ) : (
        <>
          {workspace.unsentIds.length ? (
            <Button
              data-testid="batch-retry"
              className={buttonClass}
              isDisabled={batch.pending}
              onPress={batch.retry}
            >
              继续处理剩余项 · {workspace.unsentIds.length}张
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
              {workspace.unsentIds.length ? (
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
              {batch.failedIds.length &&
              workspace.command?.type === 'reprocess' &&
              workspace.command.scope !== 'all' ? (
                <Button
                  data-testid="batch-retry-all"
                  className={buttonClass}
                  isDisabled={batch.pending || !!workspace.unsentIds.length}
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
                    (!!workspace.unsentIds.length &&
                      workspace.command?.type === 'reprocess' &&
                      workspace.command.scope !== scope)
                  }
                  onPress={() => batch.retryTasks(scope)}
                >
                  重试{scopeNames[scope]}失败 ·{' '}
                  {batchFailedTaskIds(workspace.results, scope).length}张
                </Button>
              ))}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
