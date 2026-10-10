'use client';

import { Modal } from '@heroui/react/modal';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';

export function AnalyticsScopeDialog({
  open,
  usage,
  onClose,
}: {
  open: boolean;
  usage: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container
          placement="center"
          scroll="inside"
          className="w-full p-4 sm:w-full sm:p-4"
        >
          <Modal.Dialog
            data-testid="analytics-scope-dialog"
            className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 rounded-xl border border-border bg-surface p-6"
            aria-label={usage ? '存储占用如何计算' : '访问统计如何计算'}
          >
            <Modal.Header className="flex flex-row items-start justify-between gap-3 p-0">
              <Modal.Heading className="text-xl font-medium">
                {usage ? '存储占用如何计算' : '访问统计如何计算'}
              </Modal.Heading>
              <CloseButton
                className="size-11 shrink-0"
                aria-label="关闭统计说明"
                onPress={onClose}
              />
            </Modal.Header>
            <Modal.Body
              className={`${usage ? 'm-0' : ''} grid min-h-0 overflow-y-auto gap-4 p-0 text-sm leading-normal`}
            >
              {usage ? (
                <>
                  <p>
                    四类对象互斥计数：正常原图、正常派生、回收站、处理中／待清理。
                    有对象待核对时，总占用尚未确认，不显示完整比例。
                  </p>
                  <p className="text-[13px] text-muted">
                    按 Ariso 对象记录展示，不是 Bucket
                    容量或整机磁盘占用。包含已登记候选、旧对象、上传临时及探测对象；不含数据库、日志和宿主机中转文件。
                  </p>
                  <p className="text-[13px] text-muted">
                    停用不清零。永久删除受理后仍可能占用空间，成功清理对象后才减少；外部手工删改可能尚未反映。
                  </p>
                </>
              ) : (
                <>
                  <p>
                    访问量统计公开图片的有效内容请求，不代表独立访客或完整下载人数。
                  </p>
                  <p className="text-[13px] text-muted">
                    不计所有者、私有图片、缩略图、预览、HEAD、304 和拒绝请求。S3
                    以成功签发计数，后续远端失败无法撤回。
                  </p>
                  <p className="text-[13px] text-muted">
                    统计为近似值。每日明细保留 365
                    天，更早数据只保留累计。异常退出可能丢失尚未保存的少量访问。
                  </p>
                </>
              )}
            </Modal.Body>
            <Modal.Footer className={usage ? 'mt-0 p-0' : 'p-0'}>
              <Button
                variant="primary"
                className="h-12 w-full rounded-lg"
                onPress={onClose}
              >
                {usage ? '返回当前占用' : '返回访问统计'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
