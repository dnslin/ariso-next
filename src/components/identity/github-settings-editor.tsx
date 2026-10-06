'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Form } from '@heroui/react/form';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import { Check, RefreshCw } from 'lucide-react';
import { GithubSettingsFields } from './github-settings-fields';
import { GithubSettingsSummary } from './github-settings-summary';
import {
  useGithubSettingsEditor,
  type GithubSettingsEditorProps,
} from './use-github-settings-editor';

export function GithubSettingsEditor(props: GithubSettingsEditorProps) {
  const editor = useGithubSettingsEditor(props);
  const [clearOpen, setClearOpen] = useState(false);
  const actionClass = 'h-12 min-h-12 w-full rounded-lg text-sm font-normal';
  return (
    <>
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
              data-testid="oauth-page"
              data-state={editor.phase}
              className="relative max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-130 gap-4.5 overflow-y-auto rounded-3xl border border-border bg-surface px-5 py-6 text-foreground shadow-none sm:px-7"
            >
              <CloseButton
                aria-label="关闭登录配置"
                isDisabled={editor.busy}
                className="absolute top-3 right-3 size-11 min-w-11 bg-transparent hover:bg-transparent data-[hovered=true]:bg-transparent data-[pressed=true]:transform-none"
                onPress={editor.close}
              />
              <Modal.Header className="grid gap-2 pr-7">
                <Modal.Heading className="text-[22px] font-medium leading-normal">
                  GitHub 登录配置
                </Modal.Heading>
                <p className="text-[13px] leading-normal text-muted">
                  当前生效：
                  {props.settings.effective.enabled ? '已启用' : '未启用'}
                  。更改配置需重启容器后生效。
                </p>
              </Modal.Header>
              <Form
                validationBehavior="aria"
                className="grid w-full gap-4.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void editor.submit();
                }}
              >
                <Modal.Body className="m-0 grid flex-none gap-3.5 overflow-visible p-0 text-foreground">
                  <GithubSettingsFields
                    editor={editor}
                    settings={props.settings}
                    onClear={() => setClearOpen(true)}
                  />
                  {editor.phase === 'unknown' || editor.phase === 'checking' ? (
                    <p className="text-sm leading-normal text-muted">
                      连接中断不代表保存失败。
                      {editor.phase === 'checking'
                        ? '正在核对当前配置…'
                        : '请重新核对，不能再次提交配置。'}
                    </p>
                  ) : null}
                  {editor.verified ? (
                    <>
                      <GithubSettingsSummary
                        settings={editor.verified}
                        verified
                      />
                      <p className="text-[13px] leading-normal text-muted">
                        已核对当前配置，无法确认这次密钥修改结果。关闭后可从当前配置重新编辑。
                      </p>
                    </>
                  ) : null}
                  {editor.feedback ? (
                    <p
                      role="alert"
                      className="text-sm leading-normal text-danger"
                    >
                      {editor.feedback}
                    </p>
                  ) : null}
                </Modal.Body>
                <Modal.Footer className="m-0 grid w-full grid-cols-1 gap-2.5 p-0">
                  {editor.phase === 'unknown' || editor.phase === 'checking' ? (
                    <Button
                      data-testid="oauth-reload"
                      type="button"
                      className={actionClass}
                      isDisabled={editor.busy}
                      onPress={() => void editor.check()}
                    >
                      {editor.busy ? (
                        <Spinner size="sm" color="current" />
                      ) : (
                        <RefreshCw className="size-4" aria-hidden />
                      )}
                      {editor.busy ? '正在核对…' : '重新核对配置'}
                    </Button>
                  ) : editor.phase === 'verified' ? null : (
                    <Button
                      data-testid="oauth-save"
                      type="submit"
                      isDisabled={editor.busy}
                      className={actionClass}
                    >
                      {editor.busy ? (
                        <Spinner size="sm" color="current" />
                      ) : (
                        <Check className="size-4" aria-hidden />
                      )}
                      {editor.busy ? '正在保存…' : '保存配置'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    isDisabled={editor.busy}
                    className={`${actionClass} bg-background`}
                    onPress={editor.close}
                  >
                    {editor.phase === 'verified' ? '返回账号与安全' : '取消'}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      {clearOpen ? (
        <Modal isOpen onOpenChange={setClearOpen}>
          <Modal.Backdrop>
            <Modal.Container placement="center" className="w-full p-4">
              <Modal.Dialog
                data-testid="oauth-clear-dialog"
                className="relative max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-112 gap-4 overflow-y-auto rounded-3xl border border-border bg-surface p-6 text-foreground shadow-none"
              >
                <CloseButton
                  aria-label="关闭清除密钥确认"
                  className="absolute top-3 right-3 size-11 min-w-11 bg-transparent"
                  onPress={() => setClearOpen(false)}
                />
                <Modal.Header className="pr-8">
                  <Modal.Heading className="text-xl font-medium leading-normal">
                    清除 Client Secret？
                  </Modal.Heading>
                </Modal.Header>
                <Modal.Body className="m-0 p-0 text-sm leading-normal">
                  保存后将清除现有密钥并停用 GitHub
                  登录。容器重启前仍使用当前生效配置。
                </Modal.Body>
                <Modal.Footer className="m-0 grid grid-cols-2 gap-3 p-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 w-full rounded-lg bg-background text-sm font-normal"
                    onPress={() => setClearOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    data-testid="oauth-secret-clear-confirm"
                    type="button"
                    className="min-h-12 w-full rounded-lg text-sm font-normal"
                    onPress={() => {
                      editor.clearSecret();
                      setClearOpen(false);
                    }}
                  >
                    清除并停用
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}
    </>
  );
}
