'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { TextArea } from '@heroui/react/textarea';
import { ClipboardCopy, Check } from 'lucide-react';
import { formatTokenTime } from './token-time';
import type { TokenCreator } from './token-use-create';

export function TokenSecret({
  creator,
  timeZone,
}: {
  creator: TokenCreator;
  timeZone: string;
}) {
  const secretField = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{
    selectionStart: number;
    selectionEnd: number;
    selectionDirection: 'forward' | 'backward' | 'none';
    scrollTop: number;
  } | null>(null);
  const restoreSelection = useCallback(() => {
    const saved = pendingSelection.current;
    const current = secretField.current;
    if (saved && current) {
      current.setSelectionRange(
        saved.selectionStart,
        saved.selectionEnd,
        saved.selectionDirection,
      );
      current.scrollTop = saved.scrollTop;
    }
    pendingSelection.current = null;
  }, []);
  useLayoutEffect(restoreSelection, [creator.copyFailed, restoreSelection]);
  async function copy() {
    if (!secretField.current || pendingSelection.current) return;
    const { selectionStart, selectionEnd, selectionDirection, scrollTop } =
      secretField.current;
    pendingSelection.current = {
      selectionStart,
      selectionEnd,
      selectionDirection,
      scrollTop,
    };
    const failed = !(await creator.copy());
    if (!secretField.current) return;
    if (failed === creator.copyFailed) restoreSelection();
  }
  return (
    <>
      <Modal.Body className="m-0 grid flex-none gap-3.5 overflow-visible p-0 text-sm leading-normal text-foreground">
        <p className="wrap-anywhere">
          {creator.record?.name ?? creator.record?.id} ·{' '}
          {creator.record?.expiresAt
            ? `到期于 ${formatTokenTime(creator.record.expiresAt, timeZone)}`
            : '永不过期'}
        </p>
        <TextArea
          ref={secretField}
          data-testid="api-secret"
          aria-label="完整 Token"
          defaultValue={creator.secret}
          readOnly
          rows={3}
          className="w-full resize-none rounded-xl border-0 bg-default p-4 text-sm leading-normal text-foreground shadow-none wrap-anywhere"
        />
        <p>关闭后无法再次查看。请将完整 Token 保存在你信任的位置。</p>
        {creator.copyFailed ? (
          <p
            data-testid="api-copy-error"
            role="alert"
            className="text-[13px] text-danger"
          >
            复制失败：无法写入剪贴板。请选中上方完整 Token 手动复制。
          </p>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="m-0 grid w-full grid-cols-1 gap-3 p-0">
        <Button
          data-testid="api-copy"
          className="h-12 min-h-12 w-full rounded-lg text-sm font-normal"
          onPress={() => void copy()}
        >
          <ClipboardCopy className="size-4" aria-hidden />
          {creator.copyFailed ? '再次复制' : '复制 Token'}
        </Button>
        <Button
          data-testid="api-saved-close"
          variant="outline"
          className="h-12 min-h-12 w-full rounded-lg bg-background text-sm font-normal"
          onPress={creator.savedClose}
        >
          <Check className="size-4" aria-hidden />
          我已保存，关闭
        </Button>
      </Modal.Footer>
    </>
  );
}
