'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { Tooltip } from '@heroui/react/tooltip';
import { Info } from 'lucide-react';

const explanation =
  '仅用于允许无认证发送的 SMTP 中继。清除会同时保存空用户名和密码，主机、端口、连接方式及发件人保留。';
const tipClass =
  'max-w-[min(320px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-4 text-[13px] leading-normal text-foreground shadow-none';

export function SmtpTip({ disabled }: { disabled: boolean }) {
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const source = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const change = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const button = (
    <Button
      ref={source}
      data-testid="smtp-tip"
      type="button"
      isIconOnly
      variant="ghost"
      isDisabled={disabled}
      className="size-11 min-w-11 rounded-lg p-0 text-foreground"
      aria-label="清除 SMTP 凭据说明"
    >
      <Info className="size-5" aria-hidden />
    </Button>
  );
  if (mobile)
    return (
      <Popover isOpen={open && !disabled} onOpenChange={setOpen}>
        {button}
        <Popover.Content className={tipClass} placement="bottom end">
          <Popover.Dialog
            data-testid="smtp-tip-content"
            aria-label="清除 SMTP 凭据说明"
            className="grid gap-3 p-0"
          >
            <p>{explanation}</p>
            <Button
              data-testid="smtp-tip-close"
              variant="ghost"
              className="min-h-11 w-fit rounded-lg text-foreground"
              onPress={() => {
                setOpen(false);
                requestAnimationFrame(() =>
                  source.current?.focus({ preventScroll: true }),
                );
              }}
            >
              关闭说明
            </Button>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    );
  return (
    <Tooltip
      isOpen={open && !disabled}
      onOpenChange={setOpen}
      delay={0}
      closeDelay={300}
    >
      {button}
      <Tooltip.Content
        data-testid="smtp-tip-content"
        className={tipClass}
        placement="bottom end"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
      >
        {explanation}
      </Tooltip.Content>
    </Tooltip>
  );
}
