'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Chip } from '@heroui/react/chip';
import { Skeleton } from '@heroui/react/skeleton';
import { Modal } from '@heroui/react/modal';
import { Card } from '@heroui/react/card';
import { ProgressBar } from '@heroui/react/progress-bar';
import { notifyLibraryChanged } from '../library/library-changes';
import { bytesLabel, stepLabels } from '../library/detail-labels';
import { useResetUpload } from './provider';
import { UploadResult, useUploadResult } from './result';
import { UploadTransferDetails } from './transfer-details';
import { TrashAction } from '../library/trash-actions';
import type { UploadItem, UploadState } from './types';
import type { UploadController } from './controller';

export const uploadLabels: Record<UploadState, string> = {
  queued: '等待上传',
  submitting: '正在提交并检查设置',
  'waiting-upload': '等待传输',
  uploading: '正在上传',
  saving: '正在核验和保存',
  'processing-queued': '服务端排队',
  processing: '图片处理中',
  ready: '成功',
  'upload-failed': '上传失败 · 未创建图片',
  'processing-failed': '处理失败 · 原图保留',
  cancelled: '已取消',
  unknown: '结果待核对',
};

function UploadPreview({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return url && !failed ? (
    <span className="relative size-14 shrink-0 overflow-hidden rounded-lg xl:size-16">
      {!loaded ? (
        <Skeleton aria-hidden className="absolute inset-0 size-full" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- Local Blob and authenticated URLs bypass the optimizer. */}
      <img
        src={url}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className="size-14 rounded-lg object-cover xl:size-16"
      />
    </span>
  ) : (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-default text-xs xl:size-16">
      {name.split('.').at(-1)?.slice(0, 8).toUpperCase() || '图片'}
    </span>
  );
}

function ProcessingOptions({
  item,
  onOpen,
  query,
  client,
  mutationPending,
  unavailable,
  onPending,
  onUnavailable,
}: {
  item: UploadItem;
  query: ReturnType<typeof useUploadResult>;
  client: QueryClient;
  mutationPending: boolean;
  unavailable: boolean;
  onPending: (pending: boolean) => void;
  onUnavailable: (status: 401 | 404) => void;
  onOpen: (id: string, element: HTMLElement) => void;
}) {
  const [options, setOptions] = useState(false);
  const [reprocessId, setReprocessId] = useState<string | null>(null);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const optionsTrigger = useRef<HTMLButtonElement | null>(null);
  async function reprocess() {
    if (!item.imageId || submitting.current) return;
    submitting.current = true;
    onPending(true);
    setReprocessError(null);
    try {
      const response = await fetch(
        `/api/images/${encodeURIComponent(item.imageId)}/reprocess`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'all' }),
          cache: 'no-store',
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 404)
          onUnavailable(response.status);
        if (response.status >= 500) setUncertain(true);
        throw new Error(`${result.message}（HTTP ${response.status}）`);
      }
      setReprocessId(result.jobId);
      notifyLibraryChanged();
    } catch (error) {
      setReprocessError(error instanceof Error ? error.message : String(error));
      // A disconnected response cannot prove that the server rejected the task.
      if (error instanceof TypeError || error instanceof SyntaxError)
        setUncertain(true);
    } finally {
      await query.refetch();
      submitting.current = false;
      onPending(false);
    }
  }
  const activeJob = query.data?.activeJob;
  const retryFailed = query.data?.latestFailedJob?.id === reprocessId;
  return (
    <Modal
      isOpen={options}
      onOpenChange={(open) => {
        if (!mutationPending) setOptions(open);
      }}
    >
      <Button
        ref={optionsTrigger}
        variant="outline"
        className="h-11 w-full rounded-lg text-sm font-normal"
      >
        处理选项
      </Button>
      <Modal.Backdrop
        isDismissable={!mutationPending}
        isKeyboardDismissDisabled={mutationPending}
      >
        <Modal.Container placement="center" className="p-4">
          <Modal.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6">
            <Modal.Header className="flex flex-row items-center justify-between gap-3">
              <Modal.Heading className="text-xl font-medium leading-normal">
                原图已保存，图片处理失败
              </Modal.Heading>
              <CloseButton
                aria-label="关闭处理选项"
                className="size-11 shrink-0 rounded-lg border border-border"
                isDisabled={mutationPending}
                onPress={() => setOptions(false)}
              />
            </Modal.Header>
            <Modal.Body className="m-0 grid gap-4 p-0 text-sm leading-normal text-foreground [overflow-wrap:anywhere]">
              <div>
                <p>
                  {item.name} · 图片 ID：{item.imageId}
                </p>
                {item.step ? (
                  <p>失败步骤：{stepLabels[item.step] ?? item.step}</p>
                ) : null}
                {item.error ? (
                  <p role="alert" className="whitespace-pre-wrap">
                    原因：{item.error}
                  </p>
                ) : null}
              </div>
              <p className="rounded-lg bg-default p-3 text-[13px]">
                原图和已保存版本保留。重新处理使用最新设置，并保留同一图片 ID。
              </p>
              {reprocessError ? (
                <p role="alert">
                  {uncertain ? '重处理提交未确认' : '重处理提交失败'}：
                  {reprocessError}
                </p>
              ) : null}
              {uncertain ? (
                <p role="alert">提交结果未知，请在图片详情核对，勿重复提交。</p>
              ) : activeJob ? (
                <p role="status">
                  当前重处理：
                  {activeJob.status === 'queued' ? '服务端排队' : '处理中'}
                  {activeJob.step
                    ? ` · ${stepLabels[activeJob.step] ?? activeJob.step}`
                    : ''}
                </p>
              ) : reprocessId ? (
                <p role="status">
                  {retryFailed
                    ? `重处理失败：${query.data?.latestFailedJob?.error ?? '请查看图片详情'}`
                    : query.data?.processingStatus === 'ready'
                      ? '当前图片已重新处理完成。本次上传的首次处理失败记录保留。'
                      : '重处理已受理，正在读取任务结果…'}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="mt-0 grid w-full grid-cols-1 justify-stretch gap-4">
              <Button
                className="h-12 w-full rounded-lg text-sm font-normal"
                isDisabled={
                  mutationPending ||
                  unavailable ||
                  query.isPending ||
                  query.isError ||
                  !!query.data?.trashedAt ||
                  !!query.data?.deletionStatus ||
                  !!activeJob ||
                  (!!reprocessId &&
                    !retryFailed &&
                    query.data?.processingStatus !== 'ready') ||
                  uncertain
                }
                onPress={() => {
                  void reprocess();
                }}
              >
                {mutationPending ? '正在提交…' : '重新处理'}
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg text-sm font-normal"
                isDisabled={mutationPending}
                onPress={() => {
                  setOptions(false);
                  const trigger = optionsTrigger.current;
                  if (item.imageId && trigger) onOpen(item.imageId, trigger);
                }}
              >
                查看详情
              </Button>
              {query.data && !query.isError && !unavailable ? (
                <TrashAction
                  record={query.data}
                  operation="trash"
                  triggerLabel="删除图片"
                  onPending={onPending}
                  onUnavailable={onUnavailable}
                  onVerified={(record) =>
                    client.setQueryData(
                      ['upload-result', item.imageId, item.state],
                      record,
                    )
                  }
                  onComplete={() => {
                    setOptions(false);
                    void client.invalidateQueries({ queryKey: ['library'] });
                    void client.invalidateQueries({ queryKey: ['trash'] });
                  }}
                />
              ) : unavailable ? (
                <p role="alert">图片记录已不存在，无法回收。</p>
              ) : (
                <UploadResult query={query} />
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export const UploadQueueItem = memo(function UploadQueueItem({
  item,
  controller,
  client,
  onOpen,
}: {
  item: UploadItem;
  controller: UploadController;
  client: QueryClient;
  onOpen: (id: string, element: HTMLElement) => void;
}) {
  const resetUpload = useResetUpload();
  const [confirm, setConfirm] = useState(false);
  const processingFailed = item.state === 'processing-failed';
  const [mutationPending, setMutationPending] = useState(false);
  const [unavailable, setUnavailable] = useState<401 | 404 | null>(null);
  const onPending = useCallback(
    (pending: boolean) => {
      if (pending)
        void client.cancelQueries({
          queryKey: ['upload-result', item.imageId, item.state],
          exact: true,
        });
      setMutationPending(pending);
    },
    [client, item.imageId, item.state],
  );
  const query = useUploadResult(
    item.imageId,
    item.state,
    client,
    mutationPending || !!unavailable,
  );
  const serverPreview =
    !mutationPending && !unavailable && !query.isError && !query.data?.trashedAt
      ? (query.data?.versions.find((version) => version.kind === 'thumbnail')
          ?.previewPath ?? null)
      : null;
  const canCancel =
    !!item.sessionId &&
    !item.imageId &&
    ['waiting-upload', 'uploading', 'saving', 'unknown'].includes(item.state);
  return (
    <Card
      data-testid="upload-item"
      data-queue-id={item.id}
      data-state={item.state}
      data-image-id={item.imageId ?? ''}
      className="min-w-0 gap-3 rounded-none border-0 bg-transparent p-0 py-2 shadow-none"
    >
      <div
        data-testid="upload-file-row"
        className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_88px] items-center gap-2 md:min-h-20 xl:grid-cols-[64px_minmax(0,1fr)_140px] xl:gap-4"
      >
        <UploadPreview
          key={item.previewUrl ?? serverPreview}
          url={item.previewUrl ?? serverPreview}
          name={item.name}
        />
        <div className="grid min-w-0 gap-1 xl:grid-cols-3 xl:items-center xl:gap-4">
          <p className="min-w-0 text-sm leading-normal [overflow-wrap:anywhere]">
            {item.name}
          </p>
          <p className="text-xs leading-normal">{bytesLabel(item.size)}</p>
          <div role="status" className="grid min-w-0 gap-1.5 text-xs leading-5">
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <span>上传状态：</span>
              <Chip
                size="sm"
                variant="soft"
                color={
                  item.state === 'ready'
                    ? 'success'
                    : item.state.includes('failed')
                      ? 'danger'
                      : item.state === 'unknown'
                        ? 'warning'
                        : 'default'
                }
                className="h-auto min-h-6 max-w-full whitespace-normal py-0.5 text-xs"
              >
                {uploadLabels[item.state]}
              </Chip>
            </div>
            {item.visibility ? (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span>图片状态：</span>
                <Chip
                  size="sm"
                  variant="soft"
                  className={
                    item.visibility === 'public'
                      ? 'bg-default text-foreground'
                      : 'bg-surface-secondary text-foreground'
                  }
                >
                  {item.visibility === 'private' ? '私有' : '公开'}
                </Chip>
              </div>
            ) : null}
          </div>
        </div>
        <div className="w-22 xl:w-35">
          {item.imageId ? (
            processingFailed ? (
              <ProcessingOptions
                item={item}
                onOpen={onOpen}
                query={query}
                client={client}
                mutationPending={mutationPending}
                unavailable={!!unavailable}
                onPending={onPending}
                onUnavailable={(status) => {
                  setUnavailable(status);
                  setMutationPending(false);
                  if (status === 401) {
                    resetUpload();
                    client.clear();
                    window.location.replace(
                      '/login?reason=expired&returnTo=%2Fupload',
                    );
                  }
                }}
              />
            ) : (
              <Button
                variant="outline"
                className="h-11 w-full rounded-lg text-sm font-normal"
                onPress={(event) =>
                  onOpen(item.imageId!, event.target as HTMLElement)
                }
              >
                查看详情
              </Button>
            )
          ) : null}
          {item.state === 'queued' ? (
            <Button
              variant="outline"
              className="h-11 w-full rounded-lg text-sm font-normal"
              onPress={() => controller.remove(item.id)}
            >
              移除
            </Button>
          ) : null}
          {canCancel ? (
            <AlertDialog isOpen={confirm} onOpenChange={setConfirm}>
              <Button
                variant="outline"
                className="h-11 w-full rounded-lg text-sm font-normal"
                isDisabled={item.cancelling}
                onPress={() => setConfirm(true)}
              >
                请求取消
              </Button>
              <AlertDialog.Backdrop isKeyboardDismissDisabled={false}>
                <AlertDialog.Container placement="center" className="p-4">
                  <AlertDialog.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6">
                    <AlertDialog.Header>
                      <AlertDialog.Heading>取消这次上传？</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body className="grid gap-3 text-sm">
                      <p>
                        仅在原图交给服务端处理前可以取消。结果以服务器确认为准。
                      </p>
                      <p className="break-all">{item.name}</p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer className="grid gap-3">
                      <Button
                        autoFocus
                        variant="outline"
                        onPress={() => setConfirm(false)}
                      >
                        继续上传
                      </Button>
                      <Button
                        onPress={() => {
                          setConfirm(false);
                          void controller.cancel(item.id);
                        }}
                      >
                        确认取消
                      </Button>
                    </AlertDialog.Footer>
                  </AlertDialog.Dialog>
                </AlertDialog.Container>
              </AlertDialog.Backdrop>
            </AlertDialog>
          ) : null}
        </div>
      </div>
      <UploadTransferDetails item={item} controller={controller} />
      {item.state === 'uploading' ? (
        <ProgressBar aria-label="文件传输进度" value={item.progress}>
          <ProgressBar.Output />
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : null}
      {item.imageId &&
      (item.state === 'processing' || item.state === 'processing-queued') ? (
        <p className="text-sm">
          已交给服务端处理，不能取消。关闭页面后处理仍会继续，可在图库查看。
        </p>
      ) : null}
      {item.step &&
      (item.state === 'processing' || item.state === 'processing-queued') ? (
        <p className="text-sm">
          处理步骤：{stepLabels[item.step] ?? item.step}
        </p>
      ) : null}
      {item.error && !processingFailed ? (
        <Alert
          status={item.state === 'unknown' ? 'warning' : 'danger'}
          role="alert"
        >
          <Alert.Content>
            <Alert.Description className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {item.error}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {item.state === 'unknown' ? (
        <Button
          variant="outline"
          onPress={() => {
            void controller.refresh(item.id);
          }}
        >
          重新核对
        </Button>
      ) : null}
      {item.state === 'upload-failed' ? (
        <p className="text-sm">
          未创建图片。本地文件已释放，再次上传请重新选择。
        </p>
      ) : null}
      {(item.imageId || ['cancelled', 'upload-failed'].includes(item.state)) &&
      (item.cleanupStatus === 'pending' || item.cleanupStatus === 'failed') ? (
        <p className="text-sm">
          {item.cleanupStatus === 'pending'
            ? '临时文件等待服务端清理。'
            : '临时文件清理失败，服务端保留清理记录。'}
          清空结果不会中断清理。
        </p>
      ) : null}
      {unavailable === 404 ? (
        <p role="alert" className="text-sm">
          图片记录已不存在，无法回收。请在图库核对。
        </p>
      ) : item.imageId && !mutationPending ? (
        <UploadResult query={query} />
      ) : null}
    </Card>
  );
});
