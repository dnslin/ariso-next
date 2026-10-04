'use client';

import { useRef } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import { Link } from '@heroui/react/link';
import { ArrowLeft, Upload } from 'lucide-react';
import { Label } from '@heroui/react/label';
import type { usePreview } from './use-preview';
import { PreviewImage } from './preview-image';
import { cardClass, formatBytes, previewTargetLabels } from './model';

const statusLabels = {
  receiving: '接收中',
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已到期',
};

export function PreviewPane({
  preview,
  expired,
  onExpire,
  onRecreate,
  onReturn,
}: {
  preview: ReturnType<typeof usePreview>;
  expired: boolean;
  onExpire: () => void;
  onRecreate: () => void;
  onReturn: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    record,
    submitted,
    file,
    target,
    status,
    active,
    stale,
    busy,
    unknown,
    queryError,
    message,
  } = preview;
  const inputsDisabled = Boolean(busy) || active || expired;
  return (
    <section
      data-testid="processing-preview"
      data-state={status}
      data-preview-id={submitted?.id ?? ''}
      data-result-target={submitted?.target ?? ''}
      data-stale={stale}
      className="grid gap-5 pb-10 min-[1200px]:gap-6"
    >
      <div className="grid gap-1.5">
        <Button
          variant="ghost"
          className="min-h-11 w-fit justify-start px-0 text-sm font-normal"
          onPress={onReturn}
        >
          <ArrowLeft className="size-4" aria-hidden />
          返回图片处理
        </Button>
        <h1
          id="processing-preview-title"
          tabIndex={-1}
          className="text-[30px] font-medium leading-normal"
        >
          临时处理预览
        </h1>
        <p className="text-sm leading-normal">
          使用当前未保存的参数生成真实结果，不保存设置或加入图库。
        </p>
      </div>
      <Card className={cardClass}>
        <h2 className="text-lg font-medium">测试图片</h2>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm wrap-anywhere">
              {file
                ? `${file.name} · ${formatBytes(file.size)}`
                : '尚未选择测试图片'}
            </p>
          </div>
          <Button
            variant="outline"
            isDisabled={inputsDisabled}
            className="h-11 shrink-0 rounded-xl px-3 text-sm font-normal"
            onPress={() => fileRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {file ? '更换测试图' : '选择测试图'}
          </Button>
        </div>
        <input
          ref={fileRef}
          data-testid="processing-preview-file"
          aria-label="选择测试图片"
          type="file"
          className="hidden"
          disabled={inputsDisabled}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) preview.setFile(selected);
            event.target.value = '';
          }}
        />
        <div className="grid gap-2">
          <Label id="processing-preview-target-label">预览目标</Label>
          <div
            role="group"
            aria-labelledby="processing-preview-target-label"
            className="grid grid-cols-2 gap-2 md:grid-cols-4"
          >
            {(
              Object.keys(
                previewTargetLabels,
              ) as (keyof typeof previewTargetLabels)[]
            ).map((value) => (
              <Button
                key={value}
                data-preview-target={value}
                aria-pressed={target === value}
                variant={target === value ? 'primary' : 'outline'}
                isDisabled={inputsDisabled}
                className="h-11 w-full min-w-0 rounded-xl px-3 text-sm font-normal"
                onPress={() => preview.setTarget(value)}
              >
                {previewTargetLabels[value]}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-[13px] leading-normal text-muted">
          选择文件和目标后，点击「生成预览」。成功结果保留30分钟。
        </p>
      </Card>
      {submitted || busy ? (
        <Card className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">
              {stale
                ? '上次预览'
                : record?.status === 'succeeded' && record.result
                  ? '预览结果'
                  : '预览状态'}
            </h2>
            <span className="rounded-lg bg-default px-3 py-1 text-[13px]">
              {busy === 'creating'
                ? '正在提交'
                : busy === 'cancelling'
                  ? '正在等待取消响应'
                  : unknown
                    ? '结果待核对'
                    : record
                      ? statusLabels[record.status]
                      : '正在读取状态'}
            </span>
          </div>
          {submitted ? (
            <div className="grid gap-1 text-[13px] wrap-anywhere">
              <p>
                {submitted.fileName} · {previewTargetLabels[submitted.target]}
              </p>
              {submitted.id ? <code>{submitted.id}</code> : null}
            </div>
          ) : null}
          {stale ? (
            <p className="text-[13px] leading-normal">
              当前参数、目标或测试图已变化。此任务沿用提交时的输入；重新生成才会应用当前选择。
            </p>
          ) : null}
          {busy || (active && !unknown) ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Spinner size="sm" />
              {busy === 'cancelling'
                ? '正在等待本次取消请求返回。尚未确认任务停止与清理完成。'
                : busy === 'creating'
                  ? '正在提交测试图。'
                  : record?.status === 'queued'
                    ? '等待共享处理名额。'
                    : '服务端正在处理。'}
            </p>
          ) : null}
          {unknown ? (
            <div className="grid gap-3 text-sm">
              <p role="alert">
                {unknown === 'create' && !submitted?.id
                  ? '连接中断，无法确认是否已创建预览。没有可查询的 ID，不会自动重复创建。'
                  : '操作结果尚未确认，请核对这个预览的实际状态。'}
              </p>
              {submitted?.id ? (
                <Button
                  data-testid="processing-preview-reconcile"
                  variant="outline"
                  className="min-h-11 w-fit rounded-xl"
                  isDisabled={preview.refreshing || expired}
                  onPress={() => void preview.refresh()}
                >
                  核对预览状态
                </Button>
              ) : (
                <Button
                  data-testid="processing-preview-recreate"
                  variant="outline"
                  className="min-h-11 w-fit rounded-xl"
                  isDisabled={expired}
                  onPress={onRecreate}
                >
                  重新创建预览
                </Button>
              )}
            </div>
          ) : null}
          {queryError || message ? (
            <div className="grid gap-3 text-sm">
              <p role="alert" className="text-danger">
                {queryError?.message ?? message}
              </p>
            </div>
          ) : null}
          {record?.error ? (
            <p role="alert" className="text-sm text-danger">
              {record.error}
            </p>
          ) : null}
          {record?.unavailableReason ? (
            <p className="text-sm">此目标不适用：{record.unavailableReason}</p>
          ) : null}
          {record?.status === 'expired' ? (
            <p className="text-sm">预览已到期，请重新生成。</p>
          ) : record?.status === 'cancelled' ? (
            <p className="text-sm">预览已取消，输入保留，可重新生成。</p>
          ) : null}
          {record?.cleanupStatus === 'failed' ? (
            <div className="grid gap-3 text-sm">
              <p role="alert" className="text-danger">
                临时文件清理失败：{record.cleanupError}
              </p>
              <Button
                variant="outline"
                className="min-h-11 w-fit rounded-xl"
                isDisabled={Boolean(busy) || Boolean(unknown) || expired}
                onPress={() => void preview.cancel()}
              >
                重试清理
              </Button>
            </div>
          ) : record?.cleanupStatus === 'deleted' && record.cleanupError ? (
            <p className="text-[13px] text-muted">
              临时文件已清理。上次清理诊断：{record.cleanupError}
            </p>
          ) : null}
          {record?.status === 'succeeded' &&
          record.result &&
          record.resultUrl ? (
            <div data-testid="processing-preview-result" className="grid gap-3">
              <div className="flex min-h-55 items-center justify-center overflow-hidden rounded-xl border border-border bg-default md:min-h-90">
                {record.result.mime === 'image/svg+xml' ? (
                  <div className="grid gap-3 p-5 text-sm">
                    <p>
                      SVG
                      原文件按附件提供，不在页面中执行。可读取原文件，或明确选择缩略图重新预览。
                    </p>
                    <Link
                      href={record.resultUrl}
                      download
                      className="flex min-h-11 w-fit items-center rounded-xl border border-border bg-background px-4 text-foreground no-underline"
                    >
                      读取 SVG 原文件
                    </Link>
                  </div>
                ) : (
                  <PreviewImage
                    key={record.id}
                    url={record.resultUrl}
                    name={submitted?.fileName ?? '测试图片'}
                    onExpire={onExpire}
                    onRefresh={preview.refresh}
                  />
                )}
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm wrap-anywhere min-[1200px]:grid-cols-4">
                <div className="grid content-start gap-1">
                  <dt className="text-[13px] text-muted">实际编码</dt>
                  <dd>
                    {record.result.format} · {record.result.mime}
                  </dd>
                </div>
                <div className="grid content-start gap-1">
                  <dt className="text-[13px] text-muted">尺寸</dt>
                  <dd>
                    {record.result.width} × {record.result.height}
                  </dd>
                </div>
                <div className="grid content-start gap-1">
                  <dt className="text-[13px] text-muted">大小</dt>
                  <dd>{formatBytes(record.result.byteSize)}</dd>
                </div>
                {record.expiresAt ? (
                  <div className="grid content-start gap-1">
                    <dt className="text-[13px] text-muted">有效期</dt>
                    <dd>
                      至 {new Date(record.expiresAt).toLocaleString('zh-CN')}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
          {submitted?.id && !unknown && (!active || queryError || message) ? (
            <Button
              data-testid="processing-preview-refresh"
              variant="outline"
              className="min-h-11 w-fit rounded-xl"
              isDisabled={Boolean(busy) || preview.refreshing || expired}
              onPress={() => void preview.refresh()}
            >
              核对预览状态
            </Button>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
