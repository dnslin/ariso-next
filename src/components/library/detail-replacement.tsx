'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Spinner } from '@heroui/react/spinner';
import { Link2, RefreshCw, Upload } from 'lucide-react';
import { DetailReturn } from './detail-controls';
import { ReplacementPreview } from './replacement-preview';
import type { DetailReplacementController } from './use-detail-replacement';

export { useDetailReplacement } from './use-detail-replacement';
const steps: Record<string, string> = {
  receiving: '接收新文件',
  identify: '识别新图片',
  original: '保存新原图',
  compressed: '生成压缩图',
  thumbnail: '生成缩略图',
  watermark: '生成水印图',
  complete: '发布新内容',
};

export function DetailReplacement({
  state,
}: {
  state: DetailReplacementController;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [state.detail?.id, state.job?.status]);
  const detail = state.detail;
  if (!detail) return null;
  const succeeded = state.job?.status === 'succeeded';
  const failed =
    state.job?.status === 'failed' || state.job?.status === 'cancelled';
  const link =
    detail.defaultLink.links?.url ??
    detail.versions.find((version) => version.kind === 'original')?.links
      ?.url ??
    `/i/${encodeURIComponent(detail.id)}`;
  return (
    <section
      data-testid="detail-replacement"
      data-job-status={state.job?.status}
      className="grid min-h-full min-w-0 content-start gap-4 xl:gap-6"
    >
      <DetailReturn onPress={state.onReturn}>返回图片详情</DetailReturn>
      <div className="grid min-w-0 gap-2">
        <h1
          ref={heading}
          tabIndex={-1}
          data-testid="detail-workspace-title"
          className="text-[28px] font-medium leading-normal xl:text-[30px]"
        >
          {succeeded
            ? '图片已替换'
            : state.active
              ? '正在替换图片'
              : '替换图片'}
        </h1>
        <p className="text-sm leading-6 text-muted">
          新原图、已有派生版本和已发布尺寸全部准备好后一起切换。准备期间外链继续使用旧图片。
        </p>
      </div>
      <ReplacementPreview
        detail={detail}
        file={state.file}
        previewUrl={state.previewUrl}
      />
      <div className="flex flex-wrap gap-3">
        <Input
          ref={fileInput}
          type="file"
          aria-label="选择替换图片文件"
          accept="image/*,.heic,.heif,.tif,.tiff,.ico,.svg"
          tabIndex={-1}
          className="sr-only"
          disabled={state.choicesDisabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            if (file) state.session.choose(file);
            event.currentTarget.value = '';
          }}
        />
        <Button
          variant="outline"
          className="min-h-12 rounded-lg"
          isDisabled={
            state.choicesDisabled ||
            !state.setup ||
            !!state.setup.unavailableReason
          }
          onPress={() => fileInput.current?.click()}
        >
          <Upload size={18} aria-hidden />
          {state.file ? '选择其他文件' : '选择新图片'}
        </Button>
        {state.file ? (
          <Button
            variant="ghost"
            className="min-h-12 rounded-lg"
            isDisabled={state.choicesDisabled}
            onPress={() => state.session.choose(null)}
          >
            取消选择
          </Button>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-2 rounded-xl border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Link2 size={17} aria-hidden />
          外链保持不变
        </p>
        <p className="break-all font-mono text-xs text-muted">{link}</p>
        <p className="text-xs leading-6 text-muted">
          保留显示名称、公开性、相册、标签、创建时间和统计记录。
        </p>
      </div>
      {!succeeded ? (
        <Alert
          status="accent"
          className="rounded-xl border border-border bg-default/40 p-3 shadow-none"
        >
          <Alert.Indicator aria-hidden />
          <Alert.Content>
            <Alert.Description className="text-sm leading-6 text-foreground">
              确认后更新图片内容，并撤销已有临时分享。替换成功后不提供旧内容的历史恢复。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {state.uploading ? (
        <div className="grid gap-3" role="status">
          <p className="text-sm">
            {state.transferComplete
              ? '文件已发送，正在确认服务器受理…'
              : '正在上传新文件…'}
          </p>
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
          <p className="text-xs text-muted">
            传输进度不代表替换完成。服务器确认受理后，还需生成并发布新内容。
          </p>
        </div>
      ) : state.active ? (
        <Alert
          status="accent"
          role="status"
          className="rounded-xl border border-border bg-default/40 p-3 shadow-none"
        >
          <Alert.Indicator aria-hidden>
            <Spinner size="sm" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Description className="text-sm leading-6 text-foreground">
              {state.job?.status === 'queued'
                ? '新内容正在排队'
                : (steps[state.job?.step ?? ''] ?? '正在准备新内容')}
              ，当前外链仍可读取旧图。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {succeeded ? (
        <Alert
          status="success"
          className="rounded-xl border border-success/40 bg-success/5 p-3 shadow-none"
        >
          <Alert.Indicator aria-hidden />
          <Alert.Content>
            <Alert.Title>替换成功</Alert.Title>
            <Alert.Description>
              全部新版本已发布。稳定外链已指向新内容，旧临时分享已失效。第三方已经保存的图片无法收回。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {failed ? (
        <Alert
          status="danger"
          className="rounded-xl border border-danger/40 bg-danger/5 p-3 shadow-none"
        >
          <Alert.Indicator aria-hidden />
          <Alert.Content>
            <Alert.Title>
              {state.job?.status === 'cancelled'
                ? '替换任务已取消'
                : '替换失败'}
            </Alert.Title>
            <Alert.Description>
              原图和所有旧版本均未切换。文件选择已保留，可核对后明确重试。
              {state.job?.error ? (
                <span className="mt-2 block break-all whitespace-pre-wrap">
                  {state.job.error}
                </span>
              ) : null}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {!state.setup && !state.error ? (
        <p role="status" className="text-sm text-muted">
          正在核对当前图片与已有版本…
        </p>
      ) : null}
      {state.setup?.unavailableReason && !state.active ? (
        <p role="status" className="text-sm">
          {state.setup.unavailableReason}
        </p>
      ) : null}
      {state.error ? (
        <Alert
          status="danger"
          className="rounded-xl border border-danger/40 bg-danger/5 p-3 shadow-none"
        >
          <Alert.Indicator aria-hidden />
          <Alert.Content>
            <Alert.Title>
              {state.unknown ? '提交结果待核对' : '操作未完成'}
            </Alert.Title>
            <Alert.Description className="break-all">
              {state.error}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {state.error ||
      state.unknown ||
      (state.setup?.unavailableReason && !state.active) ? (
        <Button
          variant="outline"
          className="min-h-12 w-fit rounded-lg"
          isDisabled={state.checking || state.uploading}
          onPress={() => {
            void state.session.read();
          }}
        >
          <RefreshCw size={17} aria-hidden />
          核对任务状态
        </Button>
      ) : null}
      {state.message ? (
        <p role="status" className="text-xs leading-6 text-muted">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

export function DetailReplacementFooter({
  state,
}: {
  state: DetailReplacementController;
}) {
  if (!state.detail) return null;
  if (state.job?.status === 'succeeded')
    return (
      <div className="w-full xl:w-50">
        <Button className="h-12 w-full rounded-lg" onPress={state.onReturn}>
          返回图片详情
        </Button>
      </div>
    );
  return (
    <div className="grid w-full grid-cols-2 gap-3 xl:w-auto xl:grid-cols-[200px_200px]">
      {state.uploading ? (
        <>
          <Button
            variant="outline"
            className="h-12 w-full rounded-lg"
            isDisabled={state.transferComplete}
            onPress={() => state.session.cancelUpload()}
          >
            取消传输
          </Button>
          <Button className="h-12 w-full rounded-lg" isDisabled>
            {state.transferComplete ? '等待服务器确认' : '正在上传'}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="outline"
            className="h-12 w-full rounded-lg"
            onPress={state.onReturn}
          >
            返回图片详情
          </Button>
          {state.active ? (
            <Button className="h-12 w-full rounded-lg" isDisabled>
              候选内容准备中
            </Button>
          ) : (
            <Button
              className="h-12 w-full rounded-lg"
              data-testid="replacement-submit"
              isDisabled={!state.canSubmit}
              onPress={() => {
                void state.session.submit();
              }}
            >
              <RefreshCw size={17} aria-hidden />
              {state.job?.status === 'failed' ? '重试替换' : '确认替换'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
