'use client';

import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Form } from '@heroui/react/form';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import {
  Check,
  CircleAlert,
  KeyRound,
  LogIn,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { IdentityField } from './identity-field';
import {
  useAccountEditor,
  type AccountEditorProps,
} from './use-account-editor';

export function AccountEditor(props: AccountEditorProps) {
  const editor = useAccountEditor(props);
  const isEmail = props.kind === 'email';
  const editing = editor.phase === 'editing' || editor.phase === 'saving';
  const verified = editor.phase === 'verified';
  const HeadingIcon = editing
    ? isEmail
      ? Mail
      : KeyRound
    : verified
      ? Check
      : CircleAlert;
  const title = editing
    ? isEmail
      ? '修改登录邮箱'
      : '修改密码'
    : verified
      ? '已核对当前邮箱'
      : '暂时无法确认修改结果';
  const actionClass = 'h-12 min-h-12 w-full rounded-lg text-sm font-normal';

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) editor.close();
      }}
    >
      <Modal.Backdrop
        isDismissable={!editor.busy}
        isKeyboardDismissDisabled={editor.busy}
      >
        <Modal.Container placement="center" className="w-full p-4">
          <Modal.Dialog
            data-testid="account-dialog"
            data-state={editor.phase}
            className="relative max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-130 gap-4.5 overflow-y-auto rounded-3xl border border-border bg-surface px-5 py-6 text-foreground shadow-none sm:px-7"
          >
            <CloseButton
              aria-label="关闭账号编辑"
              isDisabled={editor.busy}
              className="absolute top-3 right-3 size-11 min-w-11 bg-transparent hover:bg-transparent data-[hovered=true]:bg-transparent data-[pressed=true]:transform-none"
              onPress={editor.close}
            />
            <Modal.Header className="flex flex-row items-start gap-3 pr-7">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-default">
                <HeadingIcon className="size-5.5" aria-hidden="true" />
              </span>
              <div className="grid min-w-0 gap-2">
                <Modal.Heading className="text-[22px] font-medium leading-normal">
                  {title}
                </Modal.Heading>
                <p className="wrap-anywhere text-[13px] text-muted leading-normal">
                  {editing
                    ? isEmail
                      ? '输入新邮箱，并用当前密码确认。'
                      : '设置新的本地登录密码。'
                    : verified
                      ? `当前邮箱：${editor.currentEmail}`
                      : `连接中断不代表修改未发生。${
                          isEmail
                            ? editor.phase === 'checking'
                              ? '正在核对当前邮箱…'
                              : '尚未核对当前邮箱，请重新核对。'
                            : '请使用新密码登录核对；若失败，再尝试原密码。'
                        }`}
                </p>
              </div>
            </Modal.Header>
            {editing ? (
              <Form
                className="grid w-full gap-4.5"
                validationBehavior="aria"
                onSubmit={(event) => {
                  event.preventDefault();
                  void editor.submit();
                }}
              >
                <Modal.Body className="m-0 grid flex-none gap-3.5 overflow-visible p-0 text-foreground">
                  {isEmail ? (
                    <IdentityField
                      name="email"
                      label="新邮箱"
                      value={editor.values.email}
                      onChange={(value) => editor.change('email', value)}
                      error={editor.errors.email}
                      icon="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      isDisabled={editor.busy}
                    />
                  ) : null}
                  <IdentityField
                    name="currentPassword"
                    label="当前密码"
                    value={editor.values.currentPassword}
                    onChange={(value) =>
                      editor.change('currentPassword', value)
                    }
                    error={editor.errors.currentPassword}
                    secret
                    icon="password"
                    autoComplete="current-password"
                    placeholder="请输入当前密码"
                    isDisabled={editor.busy}
                  />
                  {!isEmail ? (
                    <>
                      <IdentityField
                        name="newPassword"
                        label="新密码"
                        value={editor.values.newPassword}
                        onChange={(value) =>
                          editor.change('newPassword', value)
                        }
                        error={editor.errors.newPassword}
                        secret
                        icon="password"
                        autoComplete="new-password"
                        placeholder="8–128 个字符"
                        isDisabled={editor.busy}
                      />
                      <IdentityField
                        name="confirmPassword"
                        label="确认新密码"
                        value={editor.values.confirmPassword}
                        onChange={(value) =>
                          editor.change('confirmPassword', value)
                        }
                        error={editor.errors.confirmPassword}
                        secret
                        icon="password"
                        autoComplete="new-password"
                        placeholder="再次输入新密码"
                        isDisabled={editor.busy}
                      />
                    </>
                  ) : null}
                  <p className="text-[13px] text-muted leading-normal">
                    {isEmail
                      ? '无需验证邮件。当前设备保持登录，下次登录请使用新邮箱。'
                      : '新密码为 8–128 个字符。保存后本设备保持登录，其他设备退出。'}
                  </p>
                  {editor.feedback ? (
                    <p
                      role="alert"
                      className="text-sm text-danger leading-normal"
                    >
                      {editor.feedback}
                    </p>
                  ) : null}
                </Modal.Body>
                <Modal.Footer className="m-0 grid w-full grid-cols-1 gap-2.5 p-0">
                  <Button
                    type="submit"
                    className={actionClass}
                    isDisabled={editor.busy}
                  >
                    {editor.busy ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <Check className="size-4" aria-hidden="true" />
                    )}
                    {editor.busy
                      ? '正在保存…'
                      : isEmail
                        ? '保存邮箱'
                        : '保存密码'}
                  </Button>
                  <Button
                    variant="outline"
                    className={`${actionClass} bg-background`}
                    isDisabled={editor.busy}
                    onPress={editor.close}
                  >
                    取消
                  </Button>
                </Modal.Footer>
              </Form>
            ) : (
              <>
                <Modal.Body
                  className="m-0 grid flex-none gap-3 overflow-visible p-0 text-sm text-foreground leading-normal"
                  aria-live="polite"
                >
                  {verified ? (
                    <>
                      <p className="text-muted">
                        当前邮箱已核对，仍无法确认这次修改的其他结果。
                      </p>
                    </>
                  ) : (
                    <>
                      {!isEmail ? (
                        <p className="text-muted">
                          前往登录将退出当前设备。不会自动再次提交修改。
                        </p>
                      ) : null}
                    </>
                  )}
                  {editor.feedback ? (
                    <p role="alert" className="text-danger">
                      {editor.feedback}
                    </p>
                  ) : null}
                </Modal.Body>
                <Modal.Footer className="m-0 grid w-full grid-cols-1 gap-2.5 p-0">
                  {!verified ? (
                    <Button
                      className={actionClass}
                      isDisabled={editor.busy}
                      onPress={() =>
                        void (isEmail
                          ? editor.checkEmail()
                          : editor.signOutToCheck())
                      }
                    >
                      {editor.busy ? (
                        <Spinner color="current" size="sm" />
                      ) : isEmail ? (
                        <RefreshCw className="size-4" aria-hidden="true" />
                      ) : (
                        <LogIn className="size-4" aria-hidden="true" />
                      )}
                      {editor.phase === 'checking'
                        ? '正在核对…'
                        : editor.phase === 'signing-out'
                          ? '正在退出…'
                          : isEmail
                            ? '重新核对邮箱'
                            : '前往登录核对'}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    className={`${actionClass} bg-background`}
                    isDisabled={editor.busy}
                    onPress={editor.close}
                  >
                    返回账号与安全
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
