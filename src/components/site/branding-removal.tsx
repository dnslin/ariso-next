'use client';

import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { brandLabels } from './branding-api';
import type { useBranding } from './use-branding';

export function BrandingRemoval({
  editor,
}: {
  editor: ReturnType<typeof useBranding>;
}) {
  const kind = editor.operation!.kind;
  const label = brandLabels[kind];
  const buttonClass = 'min-h-12 rounded-lg px-5 text-sm';
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) editor.cancel();
      }}
    >
      <AlertDialog.Backdrop
        isDismissable={!editor.locked}
        isKeyboardDismissDisabled={editor.locked}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog className="max-h-[calc(100dvh-32px)] overflow-auto rounded-[20px] bg-surface p-6">
            {!editor.locked ? (
              <AlertDialog.CloseTrigger className="size-11" aria-label="关闭" />
            ) : null}
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {editor.uncertain
                  ? editor.phase === 'different'
                    ? '服务器仍有素材引用'
                    : '移除结果待核对'
                  : `移除 ${label}？`}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="grid gap-3 text-sm">
              <p>移除后使用内置标识，站点名称和描述保持不变。</p>
              {editor.phase === 'failed' ? (
                <p role="alert" className="text-danger">
                  移除被拒绝：{editor.message}。当前引用未改变。
                </p>
              ) : null}
              {editor.phase === 'unknown' ? (
                <p role="alert">尚不能确认移除结果。请先核对服务器当前素材。</p>
              ) : null}
              {editor.phase === 'checking' ? (
                <p role="status">正在核对当前引用…</p>
              ) : null}
              {editor.phase === 'check-error' ? (
                <p role="alert" className="text-danger">
                  核对失败：{editor.message}。请重新核对。
                </p>
              ) : null}
              {editor.phase === 'different' ? (
                <p>
                  服务器当前仍有素材，可能来自其他页面的更新。可以保留当前素材，或明确再次移除。
                </p>
              ) : null}
              {editor.expired ? (
                <>
                  <p role="alert">会话已失效，请重新登录后核对素材。</p>
                  <Link
                    href="/login?reason=expired&returnTo=%2Fsettings%2Fgeneral%2Fbranding"
                    className="min-h-11 w-fit"
                  >
                    重新登录
                  </Link>
                </>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer className="flex flex-wrap gap-3">
              {!editor.locked ? (
                <Button
                  data-testid={`branding-${kind}-cancel`}
                  variant="outline"
                  className={buttonClass}
                  onPress={editor.cancel}
                >
                  取消
                </Button>
              ) : null}
              {!editor.uncertain ? (
                <Button
                  data-testid={`branding-${kind}-confirm-delete`}
                  className={buttonClass}
                  isDisabled={editor.locked}
                  onPress={() => void editor.save()}
                >
                  {editor.phase === 'saving'
                    ? '正在移除…'
                    : editor.phase === 'failed'
                      ? '重试移除'
                      : '确认移除'}
                </Button>
              ) : null}
              {editor.uncertain && editor.phase !== 'different' ? (
                <Button
                  data-testid={`branding-${kind}-retry-read`}
                  variant="outline"
                  className={buttonClass}
                  isDisabled={editor.busy || editor.expired}
                  onPress={() => void editor.reconcile()}
                >
                  {editor.phase === 'checking' ? '正在核对…' : '核对服务器素材'}
                </Button>
              ) : null}
              {editor.phase === 'different' ? (
                <>
                  <Button
                    data-testid={`branding-${kind}-use-server`}
                    variant="outline"
                    className={buttonClass}
                    isDisabled={editor.expired}
                    onPress={editor.useServer}
                  >
                    使用服务器素材
                  </Button>
                  <Button
                    data-testid={`branding-${kind}-retry`}
                    className={buttonClass}
                    isDisabled={editor.expired}
                    onPress={() => void editor.save(true)}
                  >
                    再次明确移除
                  </Button>
                </>
              ) : null}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
