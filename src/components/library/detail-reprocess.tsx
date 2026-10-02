'use client';

import { Alert } from '@heroui/react/alert';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Description } from '@heroui/react/description';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { useEffect, useRef } from 'react';
import type { LibraryDetail } from '../../server/library/detail-types';
import { DetailIdentity } from './detail-workspace';
import { DetailReturn, DetailTip } from './detail-controls';
import { DetailReprocessConfirmation } from './detail-reprocess-confirmation';
import { processingLabels, versionLabels } from './detail-labels';
import type { useDetailReprocess } from './use-detail-reprocess';
import type { useDetailQuery } from './use-detail-query';
import type { ReprocessScope } from './request-reprocess';
import {
  DetailReprocessResult,
  receiptJob,
  scopeLabels,
} from './detail-reprocess-result';

const scopes: ReprocessScope[] = [
  'all',
  'compressed',
  'thumbnail',
  'watermark',
];
type Controller = ReturnType<typeof useDetailReprocess>;

export function DetailReprocess({
  detail,
  state,
  query,
  onReturn,
}: {
  detail: LibraryDetail;
  state: Controller;
  query: ReturnType<typeof useDetailQuery>;
  onReturn: () => void;
}) {
  const failed = detail.processingStatus === 'failed';
  const commonReason = scopes.every(
    (scope) => detail.reprocess.scopes[scope] === detail.reprocess.scopes.all,
  )
    ? detail.reprocess.scopes.all
    : null;
  const job = state.receipt ? receiptJob(detail, state.receipt) : null;
  const heading = useRef<HTMLHeadingElement>(null);
  function cancelConfirmation() {
    const control = document.querySelector<HTMLInputElement>(
      `[data-testid="reprocess-scope-${state.scope}"] input`,
    );
    state.cancelConfirmation();
    // Restore the surviving choice after the overlay finishes restoring focus.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (control?.isConnected && !control.disabled) control.focus();
        else heading.current?.focus({ preventScroll: true });
      });
    });
  }
  useEffect(() => {
    if (
      !document.activeElement?.closest('[data-testid="reprocess-confirmation"]')
    )
      heading.current?.focus({ preventScroll: true });
  }, [state.receipt?.jobId, job?.status]);
  if (
    state.receipt &&
    (state.receipt.scope !== 'all' || (job && job.status !== 'queued'))
  ) {
    return (
      <DetailReprocessResult
        detail={detail}
        receipt={state.receipt}
        job={job}
        onReturn={onReturn}
      />
    );
  }
  return (
    <section
      data-testid="detail-reprocess"
      data-job-status={state.receipt ? 'queued' : undefined}
      className="relative isolate grid min-h-full min-w-0 content-start gap-3 xl:gap-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -inset-y-6 -z-10 overflow-hidden dark:opacity-30 xl:-inset-x-8 xl:-inset-y-7"
      >
        <div className="absolute top-[476px] -left-[90px] size-65 rounded-full bg-accent/15 blur-[90px] xl:top-[700px] xl:-left-3 xl:size-115" />
        <div className="absolute top-4 left-45 size-65 rounded-full bg-default/35 blur-[90px] xl:top-20 xl:left-[668px] xl:size-115" />
      </div>
      <DetailReturn onPress={onReturn}>返回图片详情</DetailReturn>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1
          ref={heading}
          data-testid="detail-workspace-title"
          tabIndex={-1}
          className="text-2xl font-normal leading-[37px] xl:text-[30px] xl:leading-[47px]"
        >
          {state.receipt
            ? '重新处理已排队'
            : failed
              ? '重试首次处理失败'
              : '重新处理这张图片'}
        </h1>
        <DetailTip label="处理说明">
          <p>
            {failed
              ? '按最新设置重试，保留图片 ID、原图和已保存版本。'
              : '按提交时的最新设置处理。所选新版本全部成功后一起替换，旧版本在处理期间继续可用。'}
          </p>
          <p>关闭处理开关不会删除或隐藏已有压缩图、水印图。</p>
          {state.receipt ? (
            <p>提交时的最新设置已记录，之后修改设置不影响本任务。</p>
          ) : null}
        </DetailTip>
      </div>
      <DetailIdentity detail={detail} reprocess />
      {state.receipt ? (
        <>
          <p
            data-testid="reprocess-task-status"
            role="status"
            className="text-sm leading-[22px] text-muted"
          >
            {processingLabels[detail.processingStatus]} · 任务已受理
          </p>
          <div className="max-w-160 rounded-lg bg-default px-3 py-2.5 text-[13px] leading-5">
            <p>任务范围：{scopeLabels[state.receipt.scope]}</p>
            <p>
              本次应生成：
              {state.receipt.expectedVersions
                .map((kind) => versionLabels[kind])
                .join('、')}
            </p>
            {!job ? (
              <p>最后已知状态：已排队，尚未读取到本任务的最新状态。</p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-[22px] text-muted">
            压缩{detail.reprocess.compressionEnabled ? '开启' : '关闭'} · 水印
            {detail.reprocess.watermarkEnabled ? '开启' : '关闭'} ·{' '}
            {!detail.storage.enabled
              ? '存储已停用 · 内容不可读'
              : failed
                ? '首次处理失败'
                : detail.processingStatus === 'ready'
                  ? '当前图片可用'
                  : processingLabels[detail.processingStatus]}
          </p>
          {failed ? (
            <p className="text-[13px] leading-5 text-muted">
              首次失败仅支持全部派生重试。
            </p>
          ) : null}
          <RadioGroup
            aria-label="处理范围"
            value={state.scope}
            onChange={(value) => state.choose(value as ReprocessScope)}
            isDisabled={state.pending || query.isFetching || query.isError}
            className="grid w-full max-w-160 grid-cols-1 gap-3 md:grid-cols-2"
          >
            {commonReason ? (
              <Description
                data-testid="reprocess-scope-unavailable"
                className="col-span-full text-[13px] leading-5 text-muted"
              >
                {commonReason}
              </Description>
            ) : null}
            {scopes.map((scope) => (
              <Radio
                key={scope}
                value={scope}
                isDisabled={!!detail.reprocess.scopes[scope]}
                className="group mt-0 min-w-0 gap-1.5 data-[disabled=true]:opacity-100"
              >
                <Radio.Content
                  data-testid={`reprocess-scope-${scope}`}
                  className={`min-h-14 w-full justify-start gap-3 rounded-lg border px-4 py-3 text-sm font-normal transition-colors motion-reduce:transition-none group-data-[disabled=true]:opacity-[.42] data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus ${state.scope === scope ? 'border-foreground/30 bg-default' : 'border-border bg-background data-[hovered=true]:border-foreground/25 data-[hovered=true]:bg-default/40'}`}
                >
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  {scopeLabels[scope]}
                  {detail.reprocess.scopes[scope]
                    ? ' · 不可选'
                    : state.scope === scope
                      ? ' · 已选'
                      : ''}
                </Radio.Content>
                {detail.reprocess.scopes[scope] && !commonReason ? (
                  <Description className="ps-0 text-xs leading-[19px] text-muted opacity-100">
                    {detail.reprocess.scopes[scope]}
                  </Description>
                ) : null}
              </Radio>
            ))}
          </RadioGroup>
          <p className="text-[13px] leading-5 text-muted">
            本次将更新：
            {state.scope === 'all'
              ? detail.reprocess.expectedVersions
                  .map((kind) => versionLabels[kind])
                  .join('、')
              : versionLabels[state.scope]}
          </p>
          {!detail.reprocess.compressionEnabled &&
          detail.reprocess.watermarkEnabled &&
          !failed ? (
            <div className="grid gap-2">
              <Button
                variant="outline"
                isDisabled
                className="h-11 w-fit rounded-lg"
              >
                去设置开启压缩
              </Button>
              <p className="text-xs text-muted">处理设置界面尚未开放。</p>
            </div>
          ) : null}
        </>
      )}
      {state.error && !state.confirmed ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>
              {state.unknown ? '提交结果待核对' : '重处理提交失败'}
            </Alert.Title>
            <Alert.Description>{state.error}</Alert.Description>
            <Button
              variant="outline"
              className="mt-3 min-h-11"
              isDisabled={query.isFetching}
              onPress={() => {
                void query.refetch();
              }}
            >
              核对详情
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {state.confirmed && !state.receipt && state.scope !== 'all' ? (
        <AlertDialog.Backdrop
          isOpen
          isKeyboardDismissDisabled={state.pending}
          onOpenChange={(open) => {
            if (!open && !state.pending) cancelConfirmation();
          }}
        >
          <AlertDialog.Container placement="center" className="p-4">
            <DetailReprocessConfirmation
              detail={detail}
              scope={state.scope}
              state={state}
              query={query}
              onCancel={cancelConfirmation}
            />
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      ) : null}
    </section>
  );
}

export function DetailReprocessFooter({
  detail,
  state,
  query,
  onReturn,
  onClose,
  onVersions,
}: {
  detail: LibraryDetail | undefined;
  state: Controller;
  query: ReturnType<typeof useDetailQuery>;
  onReturn: () => void;
  onClose: () => void;
  onVersions: () => void;
}) {
  const job =
    detail && state.receipt ? receiptJob(detail, state.receipt) : null;
  if (
    state.receipt &&
    (state.receipt.scope !== 'all' || (job && job.status !== 'queued'))
  ) {
    const queued = !job || job.status === 'queued';
    return (
      <div
        className={`grid w-full gap-3 xl:w-auto ${queued ? 'xl:grid-cols-[200px]' : 'grid-cols-2 xl:grid-cols-[200px_200px]'}`}
      >
        <Button
          variant={queued ? 'primary' : 'outline'}
          className="h-12 w-full rounded-lg"
          onPress={job?.status === 'succeeded' ? onClose : onReturn}
        >
          {job?.status === 'succeeded'
            ? '返回图库'
            : queued
              ? '返回图片详情'
              : '返回详情'}
        </Button>
        {!queued ? (
          <Button
            className="h-12 w-full rounded-lg"
            onPress={
              job?.status === 'failed' || job?.status === 'cancelled'
                ? state.reset
                : job?.status === 'succeeded'
                  ? onReturn
                  : onVersions
            }
          >
            {job?.status === 'failed' || job?.status === 'cancelled'
              ? '按最新设置重试'
              : job?.status === 'succeeded'
                ? '查看图片详情'
                : '查看处理结果'}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="grid w-full grid-cols-2 gap-3 xl:w-auto xl:grid-cols-[200px_200px]">
      <Button
        variant="outline"
        className="h-12 w-full rounded-lg"
        isDisabled={state.pending}
        onPress={onReturn}
      >
        返回详情
      </Button>
      {state.receipt ? (
        <Button
          variant="outline"
          className="h-12 w-full rounded-lg"
          onPress={state.reset}
        >
          返回处理范围
        </Button>
      ) : (
        <Button
          className="h-12 w-full rounded-lg"
          data-testid="reprocess-submit"
          isDisabled={
            !detail ||
            state.pending ||
            state.unknown ||
            query.isFetching ||
            query.isError ||
            !!detail.reprocess.scopes[state.scope]
          }
          onPress={() => {
            if (state.scope === 'all') void state.submit();
            else state.choose(state.scope);
          }}
        >
          {state.pending
            ? '正在提交…'
            : state.scope !== 'all'
              ? `重新生成${versionLabels[state.scope]}`
              : detail?.processingStatus === 'failed'
                ? '重试全部处理'
                : '开始全部重处理'}
        </Button>
      )}
    </div>
  );
}
