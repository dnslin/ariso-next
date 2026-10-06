'use client';

import { useEffect, useRef } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Spinner } from '@heroui/react/spinner';
import { Power, RefreshCw, Trash2 } from 'lucide-react';
import type { TokenActionController } from './token-use-action';
import { TokenSummary } from './token-summary';

const actionClass = 'h-12 min-h-12 w-full rounded-lg text-sm font-normal';

export function TokenActionDialog({
  controller,
  timeZone,
}: {
  controller: TokenActionController;
  timeZone: string;
}) {
  const { action, busy } = controller;
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (busy) return;
    const button = closeButton.current;
    const dialog = button?.closest('[role="alertdialog"]');
    if (button && !dialog?.contains(document.activeElement))
      button.focus({ preventScroll: true });
  }, [action?.phase, busy]);
  if (!action) return null;
  const working = action.phase === 'working';
  const failed = action.phase === 'failed';
  const operation =
    action.kind === 'revoke' ? '撤销' : action.token.enabled ? '停用' : '启用';
  const target = action.token.name ?? action.token.id;
  const unknown = ['unknown', 'checking', 'check-failed', 'checked'].includes(
    action.phase,
  );
  const checked = action.phase === 'checked';
  const title = working
    ? `正在${operation}`
    : failed
      ? `${operation}失败`
      : action.phase === 'checking'
        ? '正在核对 Token 列表'
        : action.phase === 'check-failed'
          ? '暂时无法核对列表'
          : checked
            ? action.current
              ? '已核对当前 Token 状态'
              : '目标已不在当前列表'
            : unknown
              ? '暂时无法确认操作结果'
              : action.expired
                ? '撤销过期 Token？'
                : `撤销 ${target}？`;
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) controller.close();
      }}
    >
      <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
        <AlertDialog.Container placement="center" className="w-full p-4">
          <AlertDialog.Dialog
            data-testid="api-revoke-dialog"
            data-state={
              working
                ? action.kind === 'revoke'
                  ? 'revoking'
                  : action.token.enabled
                    ? 'disabling'
                    : 'enabling'
                : action.phase
            }
            data-result={
              checked ? (action.current ? 'present' : 'missing') : undefined
            }
            className="flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-foreground shadow-none sm:p-6"
          >
            <AlertDialog.Header className="m-0 flex min-h-11 flex-row items-start justify-between gap-3 p-0">
              <AlertDialog.Heading className="flex items-start gap-2 text-lg font-medium leading-normal wrap-anywhere sm:text-[22px]">
                {unknown ? (
                  <RefreshCw className="mt-1 size-5 shrink-0" aria-hidden />
                ) : action.kind === 'toggle' ? (
                  <Power className="mt-1 size-5 shrink-0" aria-hidden />
                ) : (
                  <Trash2 className="mt-1 size-5 shrink-0" aria-hidden />
                )}
                {title}
              </AlertDialog.Heading>
              {!working ? (
                <CloseButton
                  ref={closeButton}
                  aria-label="关闭 Token 操作"
                  className="size-11 min-w-11 shrink-0 bg-transparent hover:bg-transparent data-[hovered=true]:bg-transparent"
                  isDisabled={busy}
                  onPress={controller.close}
                />
              ) : null}
            </AlertDialog.Header>
            <AlertDialog.Body
              className="m-0 grid flex-none gap-3 overflow-visible p-0 text-sm leading-normal text-foreground"
              aria-live="polite"
            >
              <p role={failed ? 'alert' : undefined} className="wrap-anywhere">
                {working
                  ? `正在${operation} ${target}…`
                  : failed
                    ? `${target}：${action.feedback}`
                    : action.phase === 'checking'
                      ? '正在读取真实记录。不会再次提交操作。'
                      : action.phase === 'check-failed'
                        ? '列表读取失败，操作结果仍未确认。请重新核对。'
                        : checked
                          ? action.current
                            ? '目标仍在列表中。核对只展示现在的数据，不推断是哪次请求造成的；返回列表可继续启停或撤销。'
                            : '目标可能已撤销或被自动清理。它已无法在当前列表继续操作；不会重复发送撤销请求。'
                          : unknown
                            ? '请求可能已完成。请先核对 Token 列表，再决定下一步。不会自动再次提交。'
                            : action.expired
                              ? `${target}已经过期，无法继续使用。撤销会移除这条记录。`
                              : '撤销后不能恢复。新的上传请求会被拒绝，此前上传的图片和已接纳的上传任务不受影响。'}
              </p>
              {checked && action.current ? (
                <div
                  data-testid="api-current-token"
                  data-token-id={action.current.id}
                  className="grid min-w-0 gap-2 rounded-xl border border-border p-3"
                >
                  <TokenSummary token={action.current} timeZone={timeZone} />
                </div>
              ) : unknown ? (
                <p className="text-xs text-muted wrap-anywhere">
                  目标 ID：<code>{action.token.id}</code>
                </p>
              ) : null}
              {action.feedback && !failed ? (
                <p role="alert" className="text-danger">
                  {action.feedback}
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer className="m-0 grid grid-cols-1 gap-3 p-0">
              {working ? (
                <Button
                  data-testid="api-revoke-confirm"
                  variant="outline"
                  className={`${actionClass} bg-background opacity-42`}
                  isDisabled
                >
                  处理中…
                </Button>
              ) : (
                <>
                  <Button
                    data-testid={
                      failed
                        ? 'api-action-retry'
                        : checked
                          ? 'api-action-return'
                          : unknown
                            ? 'api-check-action'
                            : 'api-revoke-confirm'
                    }
                    className={actionClass}
                    isDisabled={busy}
                    onPress={() =>
                      failed
                        ? controller.retry()
                        : checked
                          ? controller.close()
                          : unknown
                            ? void controller.check()
                            : controller.confirm()
                    }
                  >
                    {busy ? (
                      <Spinner color="current" size="sm" />
                    ) : unknown || failed ? (
                      <RefreshCw className="size-4" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                    {failed
                      ? '重试'
                      : checked
                        ? action.current
                          ? '返回列表处理'
                          : '返回 Token 列表'
                        : unknown
                          ? busy
                            ? '正在核对…'
                            : action.phase === 'check-failed'
                              ? '重新核对 Token 列表'
                              : '核对列表'
                          : '确认撤销'}
                  </Button>
                  {!checked && action.phase !== 'checking' ? (
                    <Button
                      data-testid="api-revoke-cancel"
                      variant="outline"
                      className={`${actionClass} bg-background`}
                      isDisabled={busy}
                      onPress={controller.close}
                    >
                      {unknown ? '返回 Token 列表' : '取消'}
                    </Button>
                  ) : null}
                </>
              )}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
