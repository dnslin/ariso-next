'use client';

import { useRef, useState } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Trash2 } from 'lucide-react';
import {
  storageRequest,
  storageUrl,
  StorageRequestError,
  type StorageDetail,
} from './storage-api';

export function StorageDeleteDialog({
  storage,
  onDeleted,
  onRefresh,
  isDisabled,
}: {
  storage: StorageDetail;
  onDeleted: () => void;
  onRefresh: () => void;
  isDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const blocked =
    storage.references.activeWrites > 0 ||
    Object.values(storage.references.counts).some((count) => count > 0);
  async function reconcile() {
    try {
      await storageRequest(storageUrl(storage.id));
      setError('配置仍存在。请检查引用和扫描结果后再决定是否删除。');
      setUnknown(false);
      onRefresh();
    } catch (cause) {
      if (cause instanceof StorageRequestError && cause.status === 404) {
        onDeleted();
        return;
      }
      setError(
        `无法核对删除结果，请恢复连接后重新核对：${cause instanceof Error ? cause.message : String(cause)}`,
      );
      setUnknown(true);
    }
  }
  async function remove() {
    if (pending.current || unknown) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await storageRequest(storageUrl(storage.id), { method: 'DELETE' });
      onDeleted();
    } catch (cause) {
      if (!(cause instanceof StorageRequestError) || cause.status >= 500) {
        setUnknown(true);
        await reconcile();
      } else {
        setError(cause.message);
        onRefresh();
      }
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  return (
    <>
      <AlertDialog
        isOpen={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <Button
          data-testid="storage-delete"
          variant="outline"
          className="min-h-11 rounded-lg px-3 text-sm font-normal"
          isDisabled={isDisabled || blocked}
          onPress={() => {
            setError('');
            setOpen(true);
          }}
        >
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          删除配置
        </Button>
        <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
          <AlertDialog.Container
            placement="center"
            className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
          >
            <AlertDialog.Dialog className="w-full max-w-none max-h-[calc(100dvh_-_32px)] gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 [overflow-wrap:anywhere]">
              <AlertDialog.Header className="p-0">
                <AlertDialog.Heading className="text-xl font-medium leading-normal">
                  删除空存储配置？
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="m-0! grid gap-4 p-0 text-sm leading-normal">
                <p>
                  存储“{storage.name}” · {storage.id}
                  。服务端会重新核对引用并扫描清理受管对象。
                </p>
                <div className="rounded-lg bg-default p-3 text-[13px]">
                  <p>
                    删除当前默认配置时会同时清空默认选择，不会自动选择其他默认。
                  </p>
                  <p>不会删除 Bucket、本地挂载根目录或其他应用的文件。</p>
                </div>
                {error ? (
                  <p role="alert" className="text-danger">
                    {error}
                  </p>
                ) : null}
                {unknown ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    isDisabled={busy}
                    onPress={() => {
                      setBusy(true);
                      void reconcile().finally(() => setBusy(false));
                    }}
                  >
                    核对删除结果
                  </Button>
                ) : null}
              </AlertDialog.Body>
              <AlertDialog.Footer className="mt-0! flex-col gap-4 p-0">
                <Button
                  slot="close"
                  variant="outline"
                  className="h-12 w-full rounded-lg"
                  isDisabled={busy}
                >
                  取消
                </Button>
                <Button
                  data-testid="storage-confirm-delete"
                  className="h-12 w-full rounded-lg"
                  isDisabled={busy || unknown || blocked}
                  onPress={() => void remove()}
                >
                  {busy ? '正在删除' : '确认删除'}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
