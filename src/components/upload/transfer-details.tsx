'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import type { UploadItem } from './types';
import type { UploadController } from './controller';

function UploadTransferDialog({
  item,
  controller,
  kind,
}: {
  item: UploadItem;
  controller: UploadController;
  kind: 'relay' | 'cleanup';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relay = kind === 'relay';
  function close() {
    setOpen(false);
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(
          `[data-queue-id="${item.id}"] button`,
        ) ??
        document.querySelector<HTMLElement>(
          '[data-testid="upload-clear-completed"]',
        )
      )?.focus(),
    );
  }
  async function retry() {
    setPending(true);
    setError(null);
    try {
      await controller.retryCleanup(item.id);
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      isOpen={open}
      onOpenChange={(value) => {
        if (!pending) {
          if (value) setOpen(true);
          else close();
        }
      }}
    >
      {relay || item.cleanupStatus === 'failed' ? (
        <Button
          variant="outline"
          className="h-11 rounded-lg text-sm font-normal data-[pressed=true]:transform-none"
          onPress={() => setOpen(true)}
        >
          {relay ? '通过服务器中转' : '临时文件清理失败'}
        </Button>
      ) : null}
      <Modal.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={pending}
      >
        <Modal.Container placement="center" scroll="inside" className="p-4">
          <Modal.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6">
            <Modal.Header className="flex flex-row items-center justify-between gap-3">
              <Modal.Heading className="text-xl font-medium leading-normal">
                {relay ? '通过服务器中转' : '临时文件清理失败'}
              </Modal.Heading>
              <CloseButton
                aria-label="关闭上传说明"
                className="size-11 shrink-0 rounded-lg border border-border data-[pressed=true]:transform-none"
                isDisabled={pending}
                onPress={close}
              />
            </Modal.Header>
            <Modal.Body className="m-0 grid gap-4 p-0 text-sm leading-normal text-foreground [overflow-wrap:anywhere]">
              {relay ? (
                <p>
                  {item.routeReason ??
                    '当前站点的跨域检测未通过，本次文件通过 Ariso 服务器上传到 S3。'}
                </p>
              ) : (
                <div>
                  <p>
                    {item.name} ·{' '}
                    {item.frozenSubmission?.storageName ?? item.storageId}
                  </p>
                  <p>
                    {(item.cleanupError ?? item.error)
                      ?.split('\n清理失败:')
                      .at(-1) ?? '临时对象删除失败。'}
                  </p>
                </div>
              )}
              <p className="rounded-lg bg-default p-3 text-[13px]">
                {relay
                  ? '链路在文件开始前确定。已经开始直传的文件若失败，不会悄悄改用中转重传。'
                  : '检查存储的删除权限后重试。清理完成前，该存储仍有文件引用，不能删除。'}
              </p>
              {error ? <p role="alert">清理重试失败：{error}</p> : null}
            </Modal.Body>
            <Modal.Footer className="mt-0 grid grid-cols-1 gap-4 p-0">
              <Button
                className="h-12 w-full rounded-lg text-sm font-normal"
                isDisabled={pending}
                isPending={pending}
                onPress={() => {
                  if (relay) close();
                  else void retry();
                }}
              >
                {relay ? '查看上传队列' : '重试清理'}
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg text-sm font-normal"
                isDisabled={pending}
                onPress={() =>
                  router.push(
                    `/settings/storage/${encodeURIComponent(item.storageId!)}`,
                  )
                }
              >
                {relay ? '查看存储配置' : '检查存储配置'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function UploadTransferDetails({
  item,
  controller,
}: {
  item: UploadItem;
  controller: UploadController;
}) {
  return (
    <div
      className={`${item.route === 'direct' || item.route === 'relay' || item.cleanupStatus === 'failed' ? 'flex' : 'hidden'} min-w-0 flex-wrap items-center gap-2`}
    >
      {item.route === 'direct' ? (
        <Chip size="sm" variant="soft">
          S3 直传
        </Chip>
      ) : null}
      {item.route === 'relay' ? (
        <UploadTransferDialog
          item={item}
          controller={controller}
          kind="relay"
        />
      ) : null}
      <UploadTransferDialog
        item={item}
        controller={controller}
        kind="cleanup"
      />
    </div>
  );
}
