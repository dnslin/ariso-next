'use client';

import { Button } from '@heroui/react/button';
import { ProgressBar } from '@heroui/react/progress-bar';
import { stepLabels } from './detail-labels';
import type { DetailReplacementController } from './use-detail-replacement';

export function DetailReplacementStatus({
  state,
}: {
  state: DetailReplacementController;
}) {
  const failed =
    state.job?.status === 'failed' || state.job?.status === 'cancelled';
  const phase = state.uploading
    ? 'uploading'
    : state.active
      ? 'processing'
      : state.unknown
        ? 'unknown'
        : state.selecting
          ? 'submitting'
          : state.error || failed
            ? 'failed'
            : state.job?.status === 'succeeded'
              ? 'succeeded'
              : null;
  if (!phase) return null;
  const error =
    state.error ||
    (phase === 'failed' || phase === 'unknown' ? state.job?.error : null);
  let label = error || '替换未完成';
  if (!error) {
    if (phase === 'submitting') label = '正在提交替换…';
    else if (phase === 'uploading')
      label = state.transferComplete
        ? '文件已发送，等待服务器受理…'
        : '正在上传新图片…';
    else if (phase === 'processing')
      label =
        state.job?.status === 'queued'
          ? '替换图片正在排队…'
          : '正在替换图片：' + (stepLabels[state.job?.step ?? ''] ?? '处理中');
    else if (phase === 'succeeded') label = '图片已替换';
    else if (state.job?.status === 'cancelled') label = '替换任务已取消';
    else if (state.unknown) label = '替换结果待核对';
  }
  return (
    <div
      data-testid="detail-replacement-status"
      data-state={phase}
      role={
        error || phase === 'failed' || phase === 'unknown' ? 'alert' : 'status'
      }
      className="grid gap-2 rounded-lg border border-border p-3 text-sm"
    >
      <p className="break-all whitespace-pre-wrap">{label}</p>
      {state.uploading ? (
        <ProgressBar
          aria-label="替换文件传输进度"
          value={state.progress ?? undefined}
          isIndeterminate={state.progress === null}
        >
          <ProgressBar.Output />
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : null}
      {state.error || state.unknown ? (
        <Button
          variant="outline"
          className="min-h-11 w-fit rounded-lg text-sm"
          isDisabled={state.checking || state.uploading}
          onPress={() => {
            void state.session.read();
          }}
        >
          核对任务状态
        </Button>
      ) : null}
    </div>
  );
}
