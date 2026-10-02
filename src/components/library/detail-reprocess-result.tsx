'use client';

import { useEffect, useRef } from 'react';
import type { LibraryDetail } from '../../server/library/detail-types';
import type { LibraryProcessingJob } from '../../server/library/types';
import type { ReprocessReceipt } from './request-reprocess';
import { DetailIdentity } from './detail-workspace';
import { DetailReturn } from './detail-controls';
import { stepLabels, versionLabels } from './detail-labels';

export const scopeLabels = {
  all: '全部派生',
  compressed: '仅压缩图',
  thumbnail: '仅缩略图',
  watermark: '仅水印图',
};
export function receiptJob(detail: LibraryDetail, receipt: ReprocessReceipt) {
  return detail.processingJob?.id === receipt.jobId
    ? detail.processingJob
    : null;
}

function StatusRow({
  name,
  value,
  note,
}: {
  name: string;
  value: string;
  note: string;
}) {
  return (
    <div className="grid min-h-18 content-start xl:grid-cols-3 xl:content-center xl:gap-4">
      <dt>{name}</dt>
      <dd>
        {value}
        <span className="xl:hidden"> · {note}</span>
      </dd>
      <dd className="hidden xl:block">{note}</dd>
    </div>
  );
}

export function DetailReprocessResult({
  detail,
  receipt,
  job,
  onReturn,
}: {
  detail: LibraryDetail;
  receipt: ReprocessReceipt;
  job: LibraryProcessingJob | null;
  onReturn: () => void;
}) {
  const status = job?.status ?? 'queued';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [status, receipt.jobId]);
  const succeeded = status === 'succeeded';
  const failed = status === 'failed';
  const cancelled = status === 'cancelled';
  const queued = status === 'queued';
  const available =
    detail.processingStatus === 'ready' && detail.storage.enabled;
  const title = succeeded
    ? '重新处理完成'
    : failed
      ? '重新处理失败'
      : cancelled
        ? '重处理任务已取消'
        : queued
          ? `${scopeLabels[receipt.scope]} · 正在排队`
          : '正在重新处理';
  return (
    <section
      data-testid="detail-reprocess"
      data-job-status={status}
      className="grid min-w-0 gap-3 xl:gap-4"
    >
      <DetailReturn onPress={onReturn}>返回图片详情</DetailReturn>
      <h1
        ref={heading}
        tabIndex={-1}
        data-testid="detail-workspace-title"
        className="text-[28px] font-medium leading-normal xl:text-[30px]"
      >
        {title}
      </h1>
      <p className="text-[13px] leading-normal [overflow-wrap:anywhere]">
        {detail.displayName} ·{' '}
        {queued
          ? scopeLabels[receipt.scope]
          : succeeded
            ? '新版本已生效'
            : available
              ? '当前图片仍可用'
              : '原图和已有版本保留'}
      </p>
      <DetailIdentity detail={detail} />
      <div
        data-testid="reprocess-task-status"
        role="status"
        className="rounded-lg bg-default p-3 text-[13px] leading-normal"
      >
        {succeeded ? (
          <>
            <p>本次选中的新版本已一起替换。</p>
            <p>原图不变，图片 ID 和链接格式不变。</p>
          </>
        ) : failed ? (
          <>
            <p>
              {stepLabels[job?.step ?? ''] ?? job?.step ?? '处理'}
              失败，本次候选版本未发布。
            </p>
            <p>已有版本保留，不会显示成新结果。</p>
          </>
        ) : cancelled ? (
          <>
            <p>任务已取消，本次候选版本未发布。</p>
            <p>已有版本保留。</p>
          </>
        ) : queued ? (
          <>
            <p>本次参数已固定。</p>
            <p>
              只替换
              {receipt.expectedVersions
                .map((kind) => versionLabels[kind])
                .join('、')}
              ，未选择的版本保持不变。完成前继续使用旧版本。
            </p>
          </>
        ) : (
          <p>新版本尚未全部完成，当前外链继续使用旧版本。</p>
        )}
        {!job ? (
          <p>最后已知状态：已排队，尚未读取到本任务的最新状态。</p>
        ) : null}
      </div>
      <dl className="rounded-2xl border border-border px-3 py-2 text-sm leading-normal xl:px-5">
        {succeeded ? (
          receipt.expectedVersions.map((kind) => {
            const version = detail.versions.find(
              (version) => version.kind === kind,
            );
            return (
              <StatusRow
                key={kind}
                name={versionLabels[kind]}
                value={version?.saved ? '已更新' : '资料待核对'}
                note={version?.format?.toUpperCase() ?? '格式未知'}
              />
            );
          })
        ) : failed || cancelled ? (
          <>
            <StatusRow
              name="当前版本"
              value="保留原有结果"
              note={available ? '仍可查看' : '按当前访问状态读取'}
            />
            <StatusRow
              name="本次任务"
              value={
                cancelled
                  ? '已取消'
                  : `${stepLabels[job?.step ?? ''] ?? job?.step ?? '处理'}失败`
              }
              note="未替换任何版本"
            />
          </>
        ) : queued ? (
          <>
            <StatusRow
              name="任务范围"
              value={scopeLabels[receipt.scope]}
              note={
                queued
                  ? '已排队'
                  : (stepLabels[job?.step ?? ''] ?? job?.step ?? '处理中')
              }
            />
            <StatusRow
              name="当前版本"
              value={available ? '继续可用' : '原图和已有版本保留'}
              note="等待新结果"
            />
          </>
        ) : (
          <>
            {job && job.generatedVersions.length > 0 ? (
              <StatusRow
                name={job.generatedVersions
                  .map((kind) => versionLabels[kind])
                  .join(' / ')}
                value="候选已生成"
                note="尚未替换"
              />
            ) : null}
            {receipt.expectedVersions.some(
              (kind) => !job?.generatedVersions.includes(kind),
            ) ? (
              <StatusRow
                name={receipt.expectedVersions
                  .filter((kind) => !job?.generatedVersions.includes(kind))
                  .map((kind) => versionLabels[kind])
                  .join(' / ')}
                value="处理中"
                note="全部成功后一起替换"
              />
            ) : null}
          </>
        )}
      </dl>
      {job?.error ? (
        <p role="alert" className="text-sm [overflow-wrap:anywhere]">
          失败原因：{job.error}
        </p>
      ) : null}
    </section>
  );
}
