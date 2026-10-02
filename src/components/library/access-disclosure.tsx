'use client';

import type { ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';

export function AccessDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <Button
        variant="secondary"
        aria-label={`${label}：查看访问说明`}
        className="h-11 min-w-19 justify-self-start rounded-full px-3 text-sm font-normal text-default-foreground transition-none [--button-bg-hover:var(--default)] [--button-bg-pressed:var(--default)] active:transform-none data-[pressed=true]:transform-none"
      >
        {label}
      </Button>
      <Popover.Content
        placement="bottom start"
        className="w-[min(358px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-0 md:w-80"
      >
        <Popover.Dialog
          aria-label="访问说明"
          className="grid gap-2 p-4 text-[13px] leading-5"
        >
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
