'use client';

import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import type { useSmtpPage } from './use-smtp-page';

const stages = {
  connection: '连接',
  tls: '安全连接',
  authentication: '身份验证',
  delivery: '投递',
};
export function SmtpDialog({
  editor,
}: {
  editor: ReturnType<typeof useSmtpPage>;
}) {
  const kind = editor.dialog;
  if (!kind) return null;
  const clear = kind === 'clear';
  const confirm = kind === 'test-confirm';
  const unknown = editor.result?.state === 'unknown';
  const title = clear
    ? '清除 SMTP 登录凭据？'
    : confirm
      ? '输入尚未保存'
      : unknown
        ? '测试邮件发送结果未知'
        : '测试邮件未能发送';
  return (
    <Modal.Backdrop
      isOpen={!!editor.dialog}
      isDismissable={!editor.busy}
      isKeyboardDismissDisabled={editor.busy}
      onOpenChange={(open) => {
        if (!open) editor.closeDialog();
      }}
    >
      <Modal.Container placement="center" className="w-full p-4">
        <Modal.Dialog
          data-testid={
            clear
              ? 'smtp-dialog-clear'
              : confirm
                ? 'smtp-dialog-test-confirm'
                : 'smtp-test-result'
          }
          data-state={clear || confirm ? undefined : editor.result?.state}
          data-stage={editor.result?.diagnostic?.stage}
          className="relative max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-130 gap-0 rounded-3xl border border-border bg-surface px-6 py-7 text-foreground shadow-none sm:px-7"
        >
          <CloseButton
            aria-label="关闭"
            isDisabled={editor.busy}
            onPress={editor.closeDialog}
            className="absolute top-7 right-6 size-11 min-w-11 bg-transparent hover:bg-transparent data-[pressed=true]:transform-none sm:right-7 [&_svg]:size-5"
          />
          <Modal.Header className="m-0 flex min-h-11 flex-row items-center justify-start p-0 pr-10 text-left">
            <Modal.Heading className="text-[22px] font-medium leading-normal">
              {title}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="m-0 grid gap-4 overflow-y-auto p-0 pt-4 text-sm leading-normal">
            {clear ? (
              <>
                <p>将同时清除已保存的用户名和密码，并改用无认证连接。</p>
                <p className="text-[13px] text-muted">
                  仅适用于允许无认证发送的 SMTP
                  中继。主机、端口、连接方式和发件人设置保留；不会提交其他未保存的编辑。
                </p>
              </>
            ) : confirm ? (
              <>
                <p>测试只使用已保存配置，不会保存当前输入。</p>
                <p className="text-[13px] text-muted">
                  返回后可先保存，或明确测试已保存配置。取消会保留所有输入。
                </p>
              </>
            ) : (
              <>
                <p>
                  {unknown
                    ? '未能确认发送结果。邮件可能已被服务器接受。'
                    : editor.result?.message}
                </p>
                <p className="text-[13px] text-muted">
                  {unknown
                    ? '请先检查当前所有者邮箱；主动重新测试可能再收到一封邮件。'
                    : '请检查邮件设置和服务器网络，再重新测试。'}
                </p>
                {editor.result?.diagnostic ? (
                  <p className="text-xs text-muted">
                    阶段：{stages[editor.result.diagnostic.stage]} ·{' '}
                    {editor.result.diagnostic.code}
                    {editor.result.diagnostic.command
                      ? ` · ${editor.result.diagnostic.command}`
                      : ''}
                    {editor.result.diagnostic.responseCode
                      ? ` · SMTP ${editor.result.diagnostic.responseCode}`
                      : ''}
                  </p>
                ) : unknown ? (
                  <p className="text-xs text-muted">{editor.result?.message}</p>
                ) : null}
              </>
            )}
            {clear && editor.message ? (
              <p role="alert" className="text-danger">
                {editor.message}
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="m-0 grid grid-cols-2 gap-3 p-0 pt-4">
            <Button
              variant="outline"
              isDisabled={editor.busy}
              onPress={editor.closeDialog}
              className="min-h-12 w-full rounded-lg bg-background px-3 text-sm font-normal text-foreground"
            >
              {clear || confirm ? '取消' : '返回邮件设置'}
            </Button>
            <Button
              data-testid={
                clear
                  ? 'smtp-clear-confirm'
                  : confirm
                    ? 'smtp-test-confirm'
                    : 'smtp-test-retry'
              }
              isDisabled={editor.busy}
              onPress={() => void (clear ? editor.clear() : editor.send())}
              className="min-h-12 w-full rounded-lg px-3 text-sm font-normal"
            >
              {editor.busy ? <Spinner size="sm" /> : null}
              {editor.busy
                ? '请稍候…'
                : clear
                  ? '清除并保存'
                  : confirm
                    ? '测试已保存配置'
                    : '重新测试'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
