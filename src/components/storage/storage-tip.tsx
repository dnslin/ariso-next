'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { Tooltip } from '@heroui/react/tooltip';
import { CircleHelp } from 'lucide-react';

export function StorageTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Tooltip
        isDisabled={open}
        isOpen={tooltipOpen && !open}
        onOpenChange={setTooltipOpen}
      >
        <Tooltip.Trigger<'button'>
          aria-label={`${label}说明`}
          render={(props) => (
            <Button
              {...(props as ComponentProps<typeof Button>)}
              type="button"
              variant="ghost"
              isIconOnly
              className="size-11 min-w-11 shrink-0 rounded-lg text-muted active:transform-none data-[pressed=true]:transform-none"
              onHoverStart={() => setTooltipOpen(true)}
              onHoverEnd={() => setTooltipOpen(false)}
            />
          )}
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </Tooltip.Trigger>
        <Tooltip.Content
          placement="bottom start"
          className="pointer-events-none max-w-[min(320px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-4 text-[13px] leading-5 text-foreground"
        >
          {children}
        </Tooltip.Content>
      </Tooltip>
      <Popover.Content
        placement="bottom start"
        className="w-[min(320px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-0"
      >
        <Popover.Dialog
          aria-label={`${label}说明`}
          className="grid gap-2 p-4 text-[13px] leading-5 [overflow-wrap:anywhere]"
        >
          <Popover.Heading className="text-sm font-medium">
            {label}
          </Popover.Heading>
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
