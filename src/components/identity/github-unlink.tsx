'use client';

import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import { RefreshCw, Unlink } from 'lucide-react';
import { useGithubUnlink } from './use-github-unlink';
import type { GithubBinding } from './github-request';

export function GithubUnlink(
  props: Parameters<typeof useGithubUnlink>[0] & {
    binding: NonNullable<GithubBinding>;
  },
) {
  const { binding } = props;
  const { phase, feedback, busy, close, check, submit } =
    useGithubUnlink(props);
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Backdrop isDismissable={!busy} isKeyboardDismissDisabled={busy}>
        <Modal.Container placement="center" className="w-full p-4">
          <Modal.Dialog
            data-testid="github-unlink"
            data-state={phase}
            className="relative max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-112 gap-4 overflow-y-auto rounded-3xl border border-border bg-surface p-6 text-foreground shadow-none"
          >
            <CloseButton
              aria-label="关闭解绑确认"
              isDisabled={busy}
              className="absolute top-3 right-3 size-11 min-w-11 bg-transparent hover:bg-transparent data-[hovered=true]:bg-transparent data-[pressed=true]:transform-none"
              onPress={close}
            />
            <Modal.Header className="pr-8">
              <Modal.Heading className="text-xl font-medium leading-normal">
                解绑 GitHub 账号？
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="m-0 grid gap-3 p-0 text-sm leading-normal">
              <p>
                解绑{binding.login ? ` @${binding.login}` : '当前 GitHub 账号'}
                后，该账号将不能登录本站。你仍可使用本地邮箱与密码登录。
              </p>
              {phase === 'unknown' || phase === 'checking' ? (
                <p className="text-muted">
                  连接中断不代表解绑失败。
                  {phase === 'checking'
                    ? '正在核对绑定状态…'
                    : '请核对绑定状态，不会自动重复解绑。'}
                </p>
              ) : null}
              {feedback ? (
                <p role="alert" className="text-danger">
                  {feedback}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="m-0 grid grid-cols-2 gap-3 p-0">
              <Button
                variant="outline"
                className="min-h-12 w-full rounded-lg bg-background text-sm font-normal"
                isDisabled={busy}
                onPress={close}
              >
                取消
              </Button>
              {phase === 'unknown' || phase === 'checking' ? (
                <Button
                  data-testid="account-github-reload"
                  className="min-h-12 w-full gap-2 rounded-lg text-sm font-normal"
                  isDisabled={busy}
                  onPress={() => void check()}
                >
                  {busy ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden />
                  )}
                  {busy ? '正在核对…' : '核对绑定状态'}
                </Button>
              ) : (
                <Button
                  data-testid="account-github-unlink-confirm"
                  className="min-h-12 w-full gap-2 rounded-lg text-sm font-normal"
                  isDisabled={busy}
                  onPress={() => void submit()}
                >
                  {busy ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <Unlink className="size-4" aria-hidden />
                  )}
                  {busy ? '正在解绑…' : '确认解绑'}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
