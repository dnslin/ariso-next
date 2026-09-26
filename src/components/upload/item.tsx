'use client';

import { useCallback, useRef, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { Card } from '@heroui/react/card';
import { ProgressBar } from '@heroui/react/progress-bar';
import { bytesLabel, stepLabels } from '../library/detail-labels';
import { UploadResult, useUploadResult } from './result';
import { TrashAction } from '../library/trash-actions';
import type { UploadItem, UploadState } from './types';
import type { UploadController } from './controller';

export const uploadLabels: Record<UploadState, string> = {
  queued: '等待上传',
  submitting: '正在提交并检查设置',
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
  return url && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element -- Local Blob and authenticated thumbnail URLs must not use the image optimizer.
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="size-14 rounded-lg object-cover md:size-16"
    />
  ) : (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-default text-xs md:size-16">
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
  const optionsTrigger = useRef<HTMLButtonElement | null>(null);
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
          <Modal.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6">
            <Modal.Header>
              <Modal.Heading className="text-xl font-medium leading-normal">
                原图已保存，图片处理失败
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="grid gap-4 text-sm leading-normal [overflow-wrap:anywhere]">
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
                原图和已保存版本保留。移入回收站不会自动清理文件。
              </p>
            </Modal.Body>
            <Modal.Footer className="grid gap-4">
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
                  triggerLabel="移入回收站"
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
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg text-sm font-normal"
                isDisabled={mutationPending}
                onPress={() => setOptions(false)}
              >
                返回上传结果
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function UploadQueueItem({
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
  const [confirm, setConfirm] = useState(false);
  const queued = item.state === 'queued';
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
    ['uploading', 'saving', 'unknown'].includes(item.state);
  return (
    <Card
      data-testid="upload-item"
      data-state={item.state}
      data-image-id={item.imageId ?? ''}
      className={`min-w-0 border border-border bg-background shadow-none ${queued ? 'gap-4 rounded-[20px] px-4 py-5 md:min-h-[430px] md:p-6' : 'gap-3 rounded-2xl px-3 py-4 md:px-5'}`}
    >
      {queued ? (
        <h2 className="text-lg font-medium leading-normal">
          上传队列 · 待上传 1 张
        </h2>
      ) : null}
      <div
        data-testid="upload-file-row"
        className={`grid min-w-0 items-center md:min-h-20 md:grid-cols-[64px_minmax(0,1fr)_140px] md:gap-4 ${queued ? 'grid-cols-[56px_minmax(0,1fr)_72px] gap-2' : 'grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-2'}`}
      >
        <UploadPreview
          key={item.previewUrl ?? serverPreview}
          url={item.previewUrl ?? serverPreview}
          name={item.name}
        />
        <div className="grid min-w-0 gap-1 md:grid-cols-3 md:items-center md:gap-4">
          <p className="min-w-0 text-sm leading-normal [overflow-wrap:anywhere]">
            {item.name}
          </p>
          <p className="text-xs leading-normal md:hidden">
            {bytesLabel(item.size)} · {uploadLabels[item.state]}
            {item.visibility
              ? ` · ${item.visibility === 'private' ? '私有' : '公开'}`
              : ''}
          </p>
          <p className="hidden text-xs leading-normal md:block">
            {bytesLabel(item.size)}
          </p>
          <p
            role="status"
            className="sr-only text-xs leading-normal md:not-sr-only md:text-xs"
          >
            {uploadLabels[item.state]}
            {item.visibility
              ? ` · ${item.visibility === 'private' ? '私有' : '公开'}`
              : ''}
          </p>
        </div>
        <div
          className={
            queued
              ? 'w-18 md:w-35'
              : 'col-span-2 w-[110px] md:col-span-1 md:w-35'
          }
        >
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
              onPress={() => controller.remove()}
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
                          void controller.cancel();
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
            void controller.refresh();
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
      {item.cleanupStatus === 'pending' || item.cleanupStatus === 'failed' ? (
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
}
