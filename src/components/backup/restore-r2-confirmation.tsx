'use client';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
export function RestoreR2Confirmation({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Container
        placement="center"
        className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
      >
        <AlertDialog.Dialog className="max-h-[calc(100dvh_-_32px)] w-full max-w-none gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6">
          <AlertDialog.Header className="p-0">
            <AlertDialog.Heading className="text-xl font-medium">
              确认 R2 Bucket 锁定设置
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="m-0! grid gap-4 p-0 text-sm leading-6">
            <p>R2 的部分配置不能通过 S3 接口自动检查。</p>
            <div className="rounded-lg bg-default p-3 text-[13px]">
              <p>
                请在 Cloudflare 控制台确认整个目标 Bucket
                都没有锁定规则，并关闭公共访问入口。
              </p>
              <p>
                你的确认与自动检测结果会分开记录；更换位置或凭据后需要重新确认。确认后仍会执行写入、读取和删除测试。
              </p>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer className="m-0! grid gap-3 p-0">
            <Button
              variant="outline"
              className="h-12 rounded-lg"
              onPress={onClose}
            >
              返回配置
            </Button>
            <Button
              data-testid="restore-r2-confirm"
              className="h-12 rounded-lg"
              onPress={onConfirm}
            >
              已确认，开始测试
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
