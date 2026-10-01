'use client';

import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Description } from '@heroui/react/description';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { useEffect, useRef } from 'react';
import type { LibraryDetail } from '../../server/library/detail-types';
import { DetailIdentity } from './detail-workspace';
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
  const job = state.receipt ? receiptJob(detail, state.receipt) : null;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [state.confirmed, state.receipt?.jobId, job?.status]);
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
      <Button
        variant="ghost"
        className="-my-3 min-h-11 w-fit justify-start px-0 text-xs font-normal text-muted"
        onPress={state.confirmed ? state.reset : onReturn}
      >
        {state.confirmed ? '← 重新选择范围' : '← 返回图片详情'}
      </Button>
      <h1
        ref={heading}
        data-testid="detail-workspace-title"
        tabIndex={-1}
        className="text-2xl font-normal leading-[37px] xl:text-[30px] xl:leading-[47px]"
      >
        {state.receipt
          ? '重新处理已排队'
          : state.confirmed
            ? '确认处理范围'
            : failed
              ? '重试首次处理失败'
              : '重新处理这张图片'}
      </h1>
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
          <div className="rounded-[10px] bg-default px-3 py-2.5 text-[13px] leading-5">
            <p>任务范围：{scopeLabels[state.receipt.scope]}</p>
            <p>
              本次应生成：
              {state.receipt.expectedVersions
                .map((kind) => versionLabels[kind])
                .join('、')}
            </p>
            <p>提交时的最新设置已记录，之后修改设置不影响本任务。</p>
            {!job ? (
              <p>最后已知状态：已排队，尚未读取到本任务的最新状态。</p>
            ) : null}
          </div>
          <p className="text-sm leading-[22px]">
            当前已保存版本继续可用。所选新版本全部成功后一起替换。
          </p>
        </>
      ) : state.confirmed ? (
        <>
          <p className="text-lg leading-7">
            本次范围：{scopeLabels[state.scope]}
          </p>
          <div className="rounded-[10px] bg-default px-3 py-2.5 text-[13px] leading-5">
            <p>
              {state.scope === 'watermark'
                ? '只替换水印图，当前压缩图与缩略图保持不变。'
                : state.scope === 'compressed'
                  ? '只替换压缩图，缩略图和水印图保持不变。'
                  : '只替换缩略图，压缩图和水印图保持不变。'}
            </p>
            {state.scope === 'watermark' ? (
              <p>
                压缩开启时，可使用新临时压缩结果制作水印；不会替换当前压缩图。
              </p>
            ) : null}
          </div>
          <p className="text-sm leading-[22px] text-muted">
            提交时记录最新设置。当前已保存版本继续可用，直到新结果成功。
          </p>
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
          <div className="rounded-[10px] bg-default px-3 py-2.5 text-[13px] leading-5">
            {failed
              ? '首次失败只允许全部派生。按最新设置重试，保留图片 ID、原图和已保存版本。'
              : '按提交时的最新设置处理。所选新版本全部成功后一起替换，旧版本在处理期间继续可用。'}
          </div>
          <RadioGroup
            aria-label="处理范围"
            value={state.scope}
            onChange={(value) => state.choose(value as ReprocessScope)}
            isDisabled={state.pending || query.isFetching}
            className="gap-2"
          >
            {scopes.map((scope) => (
              <Radio
                key={scope}
                value={scope}
                isDisabled={!!detail.reprocess.scopes[scope]}
                className="group mt-0 gap-2 data-[disabled=true]:opacity-100"
              >
                <Radio.Content
                  data-testid={`reprocess-scope-${scope}`}
                  className="h-11 w-full justify-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-normal group-data-[disabled=true]:opacity-[.42] data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus"
                >
                  <span aria-hidden="true">
                    {state.scope === scope ? '●' : '○'}
                  </span>
                  {scopeLabels[scope]}
                  {detail.reprocess.scopes[scope]
                    ? ' · 不可选'
                    : state.scope === scope
                      ? ' · 已选'
                      : ''}
                </Radio.Content>
                {scope === 'all' ? (
                  <Description className="ps-0 text-[13px] leading-5 text-muted opacity-100">
                    本次将更新：
                    {detail.reprocess.expectedVersions
                      .map((kind) => versionLabels[kind])
                      .join('、')}
                    。
                  </Description>
                ) : null}
                {detail.reprocess.scopes[scope] ? (
                  <Description className="ps-0 text-xs leading-[19px] text-muted opacity-100">
                    {detail.reprocess.scopes[scope]}
                  </Description>
                ) : null}
              </Radio>
            ))}
          </RadioGroup>
          {detail.processingStatus === 'ready' &&
          (!detail.reprocess.compressionEnabled ||
            !detail.reprocess.watermarkEnabled) ? (
            <p className="text-[13px] leading-5 text-muted">
              关闭开关不会删除或隐藏已有压缩图、水印图。
            </p>
          ) : null}
          {!detail.reprocess.compressionEnabled &&
          detail.reprocess.watermarkEnabled &&
          !failed ? (
            <div className="grid gap-2">
              <Button
                variant="outline"
                isDisabled
                className="h-11 w-full rounded-lg"
              >
                去设置开启压缩
              </Button>
              <p className="text-xs text-muted">处理设置界面尚未开放。</p>
            </div>
          ) : null}
        </>
      )}
      {state.error ? (
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
    <div className="grid w-full grid-cols-2 gap-3">
      <Button
        variant="outline"
        className="h-11 w-full rounded-lg"
        isDisabled={state.pending}
        onPress={state.confirmed && !state.receipt ? state.reset : onReturn}
      >
        {state.confirmed && !state.receipt ? '重新选择' : '返回详情'}
      </Button>
      {state.receipt ? (
        <Button
          variant="outline"
          className="h-11 w-full rounded-lg"
          onPress={state.reset}
        >
          返回处理范围
        </Button>
      ) : (
        <Button
          className="h-11 w-full rounded-lg"
          data-testid="reprocess-submit"
          isDisabled={
            !detail ||
            state.pending ||
            state.unknown ||
            query.isFetching ||
            !!detail.reprocess.scopes[state.scope]
          }
          onPress={() => {
            void state.submit();
          }}
        >
          {state.pending
            ? '正在提交…'
            : state.confirmed
              ? `提交${scopeLabels[state.scope]}`
              : detail?.processingStatus === 'failed'
                ? '重试全部处理'
                : '开始全部重处理'}
        </Button>
      )}
    </div>
  );
}
