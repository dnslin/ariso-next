'use client';

import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';

export type BackupConfirmationKind = 'start' | 'cancel' | 'delete' | null;

export function BackupConfirmation({
  kind,
  onClose,
  onConfirm,
}: {
  kind: BackupConfirmationKind;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const start = kind === 'start';
  const cancel = kind === 'cancel';
  return (
    <AlertDialog.Backdrop
      isOpen={kind !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Container
        placement="center"
        className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
      >
        <AlertDialog.Dialog className="max-h-[calc(100dvh_-_32px)] w-full max-w-none gap-5 overflow-y-auto rounded-xl border border-border bg-surface p-6">
          <AlertDialog.Header className="p-0">
            <AlertDialog.Heading className="text-xl font-medium">
              {start
                ? '开始整站备份？'
                : cancel
                  ? '取消这次备份？'
                  : '删除这份备份？'}
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="m-0! grid gap-3 p-0 text-sm leading-6">
            {start ? (
              <>
                <p>
                  备份期间，上传、删除、整理图片和修改设置将暂停。图库浏览与已有外链继续可用。
                </p>
                <p>暂停会持续到备份完成或失败；图片较多时可能需要较长时间。</p>
                <p className="text-muted">请保管好备份密码，忘记后无法恢复。</p>
              </>
            ) : cancel ? (
              <>
                <p>
                  本次不会生成完整备份。取消后恢复修改操作，已有备份不受影响。
                </p>
              </>
            ) : (
              <>
                <p>
                  只删除服务器上的这份备份，不影响当前站点和已经下载的副本。
                </p>
                <p className="text-muted">
                  若尚未下载保存，删除后将无法使用这份备份恢复。
                </p>
              </>
            )}
          </AlertDialog.Body>
          <AlertDialog.Footer className="m-0! grid grid-cols-2 gap-3 p-0">
            <Button slot="close" variant="outline" className="h-12 rounded-lg">
              {cancel ? '继续备份' : '取消'}
            </Button>
            <Button className="h-12 rounded-lg" onPress={onConfirm}>
              {start ? '开始备份' : cancel ? '取消备份' : '删除备份'}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
