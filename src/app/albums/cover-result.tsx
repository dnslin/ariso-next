'use client';

import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { CloseButton } from '@heroui/react/close-button';
import { AlbumCoverImage } from './cover-preview';
import type { Album } from './api';

export type CoverOutcome =
  | { kind: 'idle' }
  | { kind: 'saved'; album: Album }
  | { kind: 'failed' | 'unknown' | 'missing'; message: string };

export function CoverResult({
  album,
  outcome,
  choiceName,
  pending,
  onClose,
  onReset,
  onRetry,
  onCheck,
}: {
  album: Album;
  outcome: CoverOutcome;
  choiceName: string;
  pending: boolean;
  onClose: () => void;
  onReset: () => void;
  onRetry: () => void;
  onCheck: () => void;
}) {
  const saved = outcome.kind === 'saved' ? outcome.album : null;
  const title = saved
    ? '封面已设置'
    : outcome.kind === 'unknown'
      ? '封面提交结果未知'
      : outcome.kind === 'missing'
        ? '相册已不存在'
        : '封面保存失败';
  return (
    <Modal
      isOpen={outcome.kind !== 'idle'}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={pending}
      >
        <Modal.Container placement="center" scroll="inside" className="p-4">
          <Modal.Dialog
            data-testid="cover-result"
            className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-hidden rounded-xl border border-border bg-surface px-4 py-6 shadow-[0_16px_48px_rgba(38,36,66,0.16)] md:px-6"
          >
            <Modal.Header className="flex min-h-12 shrink-0 flex-row items-center justify-between gap-2.5">
              <Modal.Heading className="text-xl font-medium leading-normal">
                {title}
              </Modal.Heading>
              <CloseButton
                aria-label="关闭"
                isDisabled={pending}
                className="size-11 shrink-0 rounded-lg border border-border bg-surface"
                onPress={onClose}
              />
            </Modal.Header>
            <Modal.Body className="m-0 grid content-start gap-4 overflow-y-auto p-0 text-sm leading-normal text-muted [overflow-wrap:anywhere]">
              <p>
                {(saved ?? album).name} · #{album.id.slice(0, 8)}
              </p>
              {saved ? (
                <>
                  <div className="rounded-[10px] bg-default px-4 py-8">
                    <div className="flex h-30 items-center justify-center">
                      <AlbumCoverImage
                        key={saved.cover.imageId}
                        cover={saved.cover}
                      />
                    </div>
                  </div>
                  <p>
                    {saved.cover.preferredCoverImageId === null
                      ? '已切换为自动封面。'
                      : `已选择 ${choiceName} 作为手动封面。`}
                  </p>
                </>
              ) : outcome.kind !== 'idle' && outcome.kind !== 'saved' ? (
                <>
                  <p role="alert" data-testid="cover-save-error">
                    {outcome.message}
                  </p>
                  <div className="grid gap-1.5 text-foreground">
                    <p>所选封面</p>
                    <p className="flex min-h-12 items-center rounded-lg border border-border bg-background px-3.5 py-3">
                      {choiceName}
                    </p>
                  </div>
                </>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="mt-0 grid shrink-0 grid-cols-1 gap-4">
              {saved ? (
                <>
                  <Button
                    variant="outline"
                    className="h-12 w-full rounded-lg font-normal"
                    onPress={onReset}
                  >
                    重新设置封面
                  </Button>
                  <Button
                    className="h-12 w-full rounded-lg font-normal"
                    onPress={onClose}
                  >
                    返回相册
                  </Button>
                </>
              ) : outcome.kind === 'unknown' ? (
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  isDisabled={pending}
                  onPress={onCheck}
                >
                  {pending ? '正在核对…' : '重新核对结果'}
                </Button>
              ) : outcome.kind === 'failed' ? (
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  isDisabled={pending}
                  onPress={onRetry}
                >
                  {pending ? '正在保存…' : '重试保存'}
                </Button>
              ) : (
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  onPress={onClose}
                >
                  返回相册
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
