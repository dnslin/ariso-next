'use client';

import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { KeyRound, RefreshCw } from 'lucide-react';
import { TokenCreateForm } from './token-create-form';
import { useTokenCreate } from './token-use-create';
import { TokenSecret } from './token-secret';
import { TokenCreateCheck, tokenCreateCheckTitle } from './token-create-check';
import type { TokenRecord } from './token-request';

const actionClass = 'h-12 min-h-12 w-full rounded-lg text-sm font-normal';

export function TokenCreateDialog(props: {
  timeZone: string;
  tokens: TokenRecord[];
  onRecord: (token: TokenRecord) => void;
  onRecords: (tokens: TokenRecord[]) => void;
  onClose: () => void;
  onUncertainClose: () => void;
  onSessionExpire: () => void;
}) {
  const creator = useTokenCreate(props);
  const editing = creator.phase === 'editing';
  const creating = creator.phase === 'creating';
  const failed = creator.phase === 'failed';
  return (
    <>
      <Modal
        isOpen
        onOpenChange={(open) => {
          if (!open) creator.close();
        }}
      >
        <Modal.Backdrop
          isDismissable={!creator.busy}
          isKeyboardDismissDisabled={
            creator.busy || creator.phase === 'close-confirm'
          }
        >
          <Modal.Container placement="center" className="w-full p-4">
            <Modal.Dialog
              data-testid="api-create-dialog"
              data-state={creator.phase}
              data-result={
                creator.phase === 'checked'
                  ? creator.candidates.length === 0
                    ? 'none'
                    : creator.candidates.length === 1
                      ? 'one'
                      : 'many'
                  : undefined
              }
              className="relative flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-foreground shadow-none sm:p-6"
            >
              <Modal.Header className="m-0 flex min-h-11 flex-row items-start justify-between gap-3 p-0">
                <Modal.Heading className="flex items-start gap-2 text-lg font-medium leading-normal sm:text-[22px]">
                  {editing || creating || failed || creator.secret ? (
                    <KeyRound className="mt-1 size-5 shrink-0" aria-hidden />
                  ) : (
                    <RefreshCw className="mt-1 size-5 shrink-0" aria-hidden />
                  )}
                  {creating
                    ? creator.finite
                      ? '正在创建限时 Token'
                      : '正在创建'
                    : failed
                      ? '创建失败'
                      : editing
                        ? '创建 Token'
                        : creator.secret
                          ? '保存你的 Token'
                          : tokenCreateCheckTitle(creator)}
                </Modal.Heading>
                {!creating ? (
                  <CloseButton
                    data-testid="api-secret-close"
                    aria-label="关闭 Token 弹窗"
                    className="size-11 min-w-11 shrink-0 bg-transparent hover:bg-transparent data-[hovered=true]:bg-transparent"
                    isDisabled={creator.busy}
                    onPress={creator.close}
                  />
                ) : null}
              </Modal.Header>
              {creating ? (
                <>
                  <Modal.Body
                    className="m-0 flex-none p-0 text-sm leading-normal text-foreground"
                    role="status"
                  >
                    正在生成上传 Token，请稍候。
                  </Modal.Body>
                  <Modal.Footer className="m-0 grid w-full grid-cols-1 p-0">
                    <Button
                      data-testid="api-create-submit"
                      variant="outline"
                      className={`${actionClass} bg-background opacity-42`}
                      isDisabled
                    >
                      处理中…
                    </Button>
                  </Modal.Footer>
                </>
              ) : failed ? (
                <>
                  <Modal.Body
                    className="m-0 flex-none p-0 text-sm leading-normal text-foreground"
                    role="alert"
                  >
                    本次未创建 Token。{creator.feedback}
                  </Modal.Body>
                  <Modal.Footer className="m-0 grid w-full grid-cols-1 gap-3 p-0">
                    <Button
                      data-testid="api-create-retry"
                      className={actionClass}
                      onPress={() => void creator.submit()}
                    >
                      重试
                    </Button>
                    <Button
                      data-testid="api-create-cancel"
                      variant="outline"
                      className={`${actionClass} bg-background`}
                      onPress={creator.close}
                    >
                      取消
                    </Button>
                  </Modal.Footer>
                </>
              ) : editing ? (
                <TokenCreateForm creator={creator} timeZone={props.timeZone} />
              ) : creator.secret ? (
                <TokenSecret creator={creator} timeZone={props.timeZone} />
              ) : (
                <TokenCreateCheck creator={creator} timeZone={props.timeZone} />
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <AlertDialog
        isOpen={creator.phase === 'close-confirm'}
        onOpenChange={(open) => {
          if (!open) creator.keepSecret();
        }}
      >
        <AlertDialog.Backdrop isKeyboardDismissDisabled={false}>
          <AlertDialog.Container placement="center" className="w-full p-4">
            <AlertDialog.Dialog
              data-testid="api-close-confirm"
              className="flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-foreground shadow-none sm:p-6"
            >
              <AlertDialog.Header className="m-0 flex min-h-11 flex-row items-start justify-between gap-3 p-0">
                <AlertDialog.Heading className="text-lg font-medium leading-normal sm:text-[22px]">
                  {creator.record?.expiresAt
                    ? '确认关闭限时 Token？'
                    : '确认关闭？'}
                </AlertDialog.Heading>
                <CloseButton
                  data-testid="api-close-confirm-cancel"
                  aria-label="返回复制 Token"
                  className="size-11 min-w-11 shrink-0 bg-transparent hover:bg-transparent data-[hovered=true]:bg-transparent"
                  onPress={creator.keepSecret}
                />
              </AlertDialog.Header>
              <AlertDialog.Body className="m-0 flex-none p-0 text-sm leading-normal text-foreground">
                关闭后无法再次查看完整 Token。如果还没有保存，请先返回复制。
              </AlertDialog.Body>
              <AlertDialog.Footer className="m-0 flex flex-wrap justify-end gap-3 p-0">
                <Button
                  data-testid="api-keep-secret"
                  variant="outline"
                  className="h-12 min-h-12 rounded-lg bg-background text-sm font-normal"
                  onPress={creator.keepSecret}
                >
                  返回复制
                </Button>
                <Button
                  data-testid="api-confirm-close"
                  className="h-12 min-h-12 rounded-lg text-sm font-normal"
                  onPress={creator.savedClose}
                >
                  仍然关闭
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
