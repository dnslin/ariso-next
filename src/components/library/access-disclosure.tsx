'use client';

import type { ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { Chip } from '@heroui/react/chip';

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
        variant="ghost"
        aria-label={label === '仅管理员可见' ? label : `${label}：查看访问说明`}
        className="min-h-11 min-w-19 justify-self-start rounded-full p-0 text-sm font-normal"
      >
        <Chip
          variant="soft"
          className="border border-border bg-transparent px-3 text-sm"
        >
          {label}
        </Chip>
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
