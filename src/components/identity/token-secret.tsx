'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Modal } from '@heroui/react/modal';
import { Tooltip } from '@heroui/react/tooltip';
import { Copy, Check } from 'lucide-react';
import { formatTokenTime } from './token-time';
import type { TokenCreator } from './token-use-create';

export function TokenSecret({
  creator,
  timeZone,
}: {
  creator: TokenCreator;
  timeZone: string;
}) {
  const secretField = useRef<HTMLInputElement>(null);
  const copying = useRef(false);
  const [copied, setCopied] = useState(false);
  const pendingSelection = useRef<{
    selectionStart: number | null;
    selectionEnd: number | null;
    selectionDirection: 'forward' | 'backward' | 'none' | null;
    scrollLeft: number;
  } | null>(null);
  const restoreSelection = useCallback(() => {
    const saved = pendingSelection.current;
    const current = secretField.current;
    if (saved && current) {
      current.setSelectionRange(
        saved.selectionStart,
        saved.selectionEnd,
        saved.selectionDirection ?? undefined,
      );
      current.scrollLeft = saved.scrollLeft;
    }
    pendingSelection.current = null;
  }, []);
  useLayoutEffect(restoreSelection, [
    creator.copyFailed,
    copied,
    restoreSelection,
  ]);
  function captureSelection() {
    if (!secretField.current || copying.current) return;
    const { selectionStart, selectionEnd, selectionDirection, scrollLeft } =
      secretField.current;
    pendingSelection.current = {
      selectionStart,
      selectionEnd,
      selectionDirection,
      scrollLeft,
    };
  }
  async function copy() {
    if (!secretField.current || copying.current) return;
    if (!pendingSelection.current) captureSelection();
    copying.current = true;
    const success = await creator.copy();
    copying.current = false;
    if (!secretField.current) return;
    setCopied(success);
    if (success === copied && !success === creator.copyFailed)
      restoreSelection();
  }
  const copyLabel = creator.copyFailed
    ? '再次复制 Token'
    : copied
      ? 'Token 已复制'
      : '复制 Token';
  return (
    <Modal.Body className="m-0 grid flex-none gap-4 overflow-visible p-0 text-sm leading-normal text-foreground">
      <p className="wrap-anywhere">
        {creator.record?.name ?? creator.record?.id} ·{' '}
        {creator.record?.expiresAt
          ? `到期于 ${formatTokenTime(creator.record.expiresAt, timeZone)}`
          : '永不过期'}
      </p>
      <div className="flex min-w-0 items-center gap-1 rounded-xl border border-border bg-default p-1.5">
        <Input
          ref={secretField}
          data-testid="api-secret"
          aria-label="完整 Token"
          defaultValue={creator.secret}
          readOnly
          className="h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2.5 font-mono text-sm text-foreground shadow-none"
        />
        <Tooltip delay={150}>
          <Button
            data-testid="api-copy"
            aria-label={copyLabel}
            isIconOnly
            variant="ghost"
            className="size-11 min-w-11 shrink-0 rounded-lg p-0"
            onPressStart={captureSelection}
            preventFocusOnPress
            onPress={() => void copy()}
          >
            {copied ? (
              <Check className="size-[18px]" aria-hidden />
            ) : (
              <Copy className="size-[18px]" aria-hidden />
            )}
          </Button>
          <Tooltip.Content className="text-xs">{copyLabel}</Tooltip.Content>
        </Tooltip>
      </div>
      {creator.copyFailed ? (
        <p
          data-testid="api-copy-error"
          role="alert"
          className="text-[13px] text-danger"
        >
          复制失败：无法写入剪贴板。请选中上方完整 Token 手动复制。
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-muted">
        关闭后无法再次查看。请将完整 Token 保存在你信任的位置。
      </p>
    </Modal.Body>
  );
}
