'use client';

import type { ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { ArrowLeft, Info } from 'lucide-react';

export function DetailReturn({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      data-testid="detail-return"
      className="min-h-11 w-fit justify-start gap-2 rounded-lg px-0 text-sm font-normal text-muted [--button-bg:transparent] [--button-bg-hover:transparent] [--button-bg-pressed:transparent] hover:text-foreground data-[pressed=true]:scale-100"
      onPress={onPress}
    >
      <ArrowLeft aria-hidden size={16} />
      {children}
    </Button>
  );
}

export function DetailTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <Button
        variant="ghost"
        aria-label={`查看${label}`}
        aria-haspopup="dialog"
        className="min-h-11 w-fit shrink-0 gap-1.5 rounded-lg px-2 text-[13px] font-normal text-muted hover:text-foreground"
      >
        <Info aria-hidden size={16} />
        {label}
      </Button>
      <Popover.Content
        placement="bottom start"
        className="w-[min(320px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-0"
      >
        <Popover.Dialog
          aria-label={label}
          className="grid max-h-[min(320px,calc(100dvh-64px))] gap-2 overflow-y-auto p-4 text-[13px] leading-5"
        >
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
