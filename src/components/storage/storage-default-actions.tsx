'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { toast } from '@heroui/react/toast';
import { useResetUpload } from '../upload/provider';
import {
  storageRequest,
  storageSettingsUrl,
  StorageRequestError,
  type StorageSettings,
  type StorageSummary,
} from './storage-api';

export function StorageDefaultActions({
  storage,
  defaultStorageId,
  busy,
  onChanged,
  showDescription = true,
}: {
  storage: StorageSummary;
  defaultStorageId: string | null;
  busy: boolean;
  onChanged: () => Promise<void>;
  showDescription?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [unknownTarget, setUnknownTarget] = useState<{
    id: string | null;
  } | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const region = useRef<HTMLElement>(null);
  const resetUpload = useResetUpload();
  const isDefault = storage.id === defaultStorageId;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  async function accepted(settings: StorageSettings, target: string | null) {
    if (!mounted.current) return;
    setUnknownTarget(null);
    if (settings.defaultStorageId === target) {
      setMessage('');
      toast.success(
        target === null
          ? '默认存储已清空。系统不会自动选择其他存储。'
          : `默认存储已更新为“${storage.name}”。已分配存储的上传保持原位置，不迁移已有图片。`,
      );
      setOpen(false);
    } else {
      setMessage(
        `服务器当前默认设置与本次选择不同：${settings.defaultStorageId ?? '未设置默认存储'}。本次未确认更新为所选值，请检查后再决定是否操作。`,
      );
    }
    try {
      await onChanged();
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) region.current?.focus();
      });
    } catch (error) {
      if (mounted.current)
        setMessage(
          `已读取默认设置，但页面刷新未完成：${error instanceof Error ? error.message : String(error)}`,
        );
    }
  }

  async function reconcile(target: string | null, signal: AbortSignal) {
    try {
      const settings = await storageRequest<StorageSettings>(
        storageSettingsUrl,
        { signal },
      );
      await accepted(settings, target);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof StorageRequestError && error.status === 401) {
        resetUpload();
        window.location.replace(
          `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      setUnknownTarget({ id: target });
      setMessage(
        `默认设置结果尚未确认，已保留本次选择。请恢复连接后重新核对，不要重复提交：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function update(target: string | null, checkOnly = false) {
    if (inFlight.current || busy || (!checkOnly && unknownTarget)) return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (checkOnly) await reconcile(target, abort.signal);
      else {
        try {
          const settings = await storageRequest<StorageSettings>(
            storageSettingsUrl,
            {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ defaultStorageId: target }),
              signal: abort.signal,
            },
          );
          await accepted(settings, target);
        } catch (error) {
          if (!mounted.current) return;
          setMessage(
            `默认设置请求未确认：${error instanceof Error ? error.message : String(error)}。正在读取服务器结果。`,
          );
          await reconcile(target, abort.signal);
        }
      }
    } finally {
      inFlight.current = false;
      controller.current = null;
      if (mounted.current) setPending(false);
    }
  }

  const disabled = busy || pending || unknownTarget !== null;
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label="默认存储设置"
      className={`grid gap-4 [overflow-wrap:anywhere] ${showDescription ? '' : 'min-w-0 flex-1 min-[1200px]:w-50 min-[1200px]:flex-none'}`}
    >
      {showDescription ? (
        <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
          {isDefault && !storage.enabled
            ? `默认仍指向“${storage.name}”。新上传不能使用该默认，系统不会自动选择其他存储。已有图片的元数据和关系保留。`
            : defaultStorageId === null
              ? '未设置默认存储。上传时请明确选择存储，或设置一个默认存储。系统不会自动选择。'
              : '默认选择只影响新上传。清空或停用默认后，不会自动选择其他存储。'}
        </p>
      ) : null}
      {message && !open ? (
        <p role="alert" className="text-sm leading-normal text-danger">
          {message}
        </p>
      ) : null}
      {isDefault ? (
        <AlertDialog
          isOpen={open}
          onOpenChange={(value) => {
            if (!pending) setOpen(value);
          }}
        >
          <Button
            data-testid="storage-clear-default"
            variant="outline"
            className={`min-h-12 rounded-lg ${showDescription ? 'justify-self-start' : 'w-full text-sm font-normal'}`}
            isDisabled={disabled}
            onPress={() => {
              setMessage('');
              setOpen(true);
            }}
          >
            清空默认
          </Button>
          <AlertDialog.Backdrop isKeyboardDismissDisabled={pending}>
            <AlertDialog.Container
              placement="center"
              className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
            >
              <AlertDialog.Dialog className="w-full max-w-none max-h-[calc(100dvh_-_32px)] gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 [overflow-wrap:anywhere]">
                <AlertDialog.Header className="p-0">
                  <AlertDialog.Heading className="text-xl font-medium leading-normal">
                    清空默认存储？
                  </AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body className="m-0! grid gap-4 p-0 text-sm leading-normal">
                  <p>所有存储和已有图片都会保留。</p>
                  <p className="rounded-lg bg-default p-3 text-[13px]">
                    清空后，Web 上传需要明确选择存储；上传 API 未传 storageId
                    时会报“未设置默认存储”。
                  </p>
                  {message ? (
                    <p role="alert" className="text-danger">
                      {message}
                    </p>
                  ) : null}
                  {unknownTarget ? (
                    <Button
                      variant="outline"
                      className="min-h-12 w-full rounded-lg"
                      isDisabled={busy || pending}
                      onPress={() => void update(unknownTarget.id, true)}
                    >
                      重新核对默认设置
                    </Button>
                  ) : null}
                </AlertDialog.Body>
                <AlertDialog.Footer className="mt-0! flex-col gap-4 p-0">
                  <Button
                    slot="close"
                    variant="outline"
                    className="h-12 w-full rounded-lg font-normal"
                    isDisabled={pending}
                  >
                    取消
                  </Button>
                  <Button
                    data-testid="storage-confirm-clear-default"
                    className="h-12 w-full rounded-lg font-normal"
                    isDisabled={disabled}
                    onPress={() => void update(null)}
                  >
                    {pending ? '正在核对' : '清空默认'}
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      ) : storage.enabled ? (
        <Button
          data-testid="storage-default"
          variant="outline"
          className={`min-h-12 rounded-lg ${showDescription ? 'justify-self-start' : 'w-full text-sm font-normal'}`}
          isDisabled={disabled}
          onPress={() => void update(storage.id)}
        >
          {showDescription ? '设为默认' : `将${storage.name}设为默认`}
        </Button>
      ) : null}
      {unknownTarget && !open ? (
        <Button
          variant="outline"
          className={`min-h-12 rounded-lg ${showDescription ? 'justify-self-start' : 'w-full text-sm font-normal'}`}
          isDisabled={busy || pending}
          onPress={() => void update(unknownTarget.id, true)}
        >
          重新核对默认设置
        </Button>
      ) : null}
    </section>
  );
}
