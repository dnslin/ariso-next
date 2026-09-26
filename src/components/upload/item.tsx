'use client';

import { useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { ProgressBar } from '@heroui/react/progress-bar';
import { bytesLabel, stepLabels } from '../library/detail-labels';
import { UploadResult } from './result';
import type { UploadItem, UploadState } from './types';
import type { UploadController } from './controller';

export const uploadLabels: Record<UploadState, string> = {
  queued: '等待上传',
  submitting: '正在提交并检查设置',
  uploading: '正在上传',
  saving: '传输完成，正在核验和保存',
  'processing-queued': '服务端排队',
  processing: '图片处理中',
  ready: '上传成功',
  'upload-failed': '上传失败 · 未创建图片',
  'processing-failed': '原图已保存，图片处理失败',
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
    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs md:size-16">
      {name.split('.').at(-1)?.slice(0, 8).toUpperCase() || '图片'}
    </span>
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
  const [serverPreview, setServerPreview] = useState<string | null>(null);
  const canCancel =
    !!item.sessionId &&
    !item.imageId &&
    ['uploading', 'saving', 'unknown'].includes(item.state);
  return (
    <Card
      data-testid="upload-item"
      data-state={item.state}
      data-image-id={item.imageId ?? ''}
      className="min-w-0 gap-4 rounded-2xl border border-border bg-background p-4 shadow-none md:p-6"
    >
      <h2 className="text-lg font-medium">上传队列 · 1 张</h2>
      <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] items-center gap-3 md:grid-cols-[64px_minmax(0,1fr)_100px_180px_140px] md:gap-4">
        <UploadPreview
          key={item.previewUrl ?? serverPreview}
          url={item.previewUrl ?? serverPreview}
          name={item.name}
        />
        <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{item.name}</p>
        <p className="col-start-2 text-sm md:col-auto">
          {bytesLabel(item.size)}
        </p>
        <p role="status" className="col-start-2 text-sm md:col-auto">
          {uploadLabels[item.state]}
          {item.visibility
            ? ` · ${item.visibility === 'private' ? '私有' : '公开'}`
            : ''}
        </p>
        <div className="col-span-2 min-h-11 md:col-auto">
          {item.state === 'queued' ? (
            <Button
              variant="outline"
              className="w-full"
              onPress={() => controller.remove()}
            >
              移除
            </Button>
          ) : null}
          {canCancel ? (
            <AlertDialog isOpen={confirm} onOpenChange={setConfirm}>
              <Button
                variant="outline"
                className="w-full"
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
          {item.imageId &&
          (item.state === 'processing' ||
            item.state === 'processing-queued') ? (
            <Button className="w-full" variant="outline" isDisabled>
              不能取消
            </Button>
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
      {item.state === 'saving' ? (
        <p className="rounded-lg bg-secondary p-3 text-sm">
          文件已传输 100%，尚未确认图片处理成功。
        </p>
      ) : null}
      {item.imageId &&
      (item.state === 'processing' || item.state === 'processing-queued') ? (
        <p className="text-sm">
          已交给服务端处理，不能取消。关闭页面后处理仍会继续，可在图库查看。
        </p>
      ) : null}
      {item.step ? (
        <p className="text-sm">
          处理步骤：{stepLabels[item.step] ?? item.step}
        </p>
      ) : null}
      {item.error ? (
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
      {item.imageId ? (
        <UploadResult
          imageId={item.imageId}
          state={item.state}
          client={client}
          onPreview={setServerPreview}
          onOpen={(element) => onOpen(item.imageId!, element)}
        />
      ) : null}
    </Card>
  );
}
