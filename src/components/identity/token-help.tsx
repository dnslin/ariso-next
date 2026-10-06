'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { Tooltip } from '@heroui/react/tooltip';
import { BookOpen, Info } from 'lucide-react';

export function TokenTimeInfo({ timeZone }: { timeZone: string }) {
  const [open, setOpen] = useState(false);
  const description = `时间按站点时区 ${timeZone} 显示。到期后 Token 即失效，过期记录可能自动清理。`;
  return (
    <>
      <span className="hidden sm:block">
        <Tooltip isOpen={open} onOpenChange={setOpen} delay={150}>
          <Button
            aria-label="时间与记录说明"
            isIconOnly
            variant="ghost"
            className="size-11 min-w-11 shrink-0 rounded-lg p-0 text-muted"
            onPress={() => setOpen(!open)}
          >
            <Info className="size-[18px]" aria-hidden />
          </Button>
          <Tooltip.Content className="max-w-72 rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed text-foreground shadow-sm">
            {description}
          </Tooltip.Content>
        </Tooltip>
      </span>
      <span className="block sm:hidden">
        <Popover>
          <Button
            aria-label="时间与记录说明"
            isIconOnly
            variant="ghost"
            className="size-11 min-w-11 shrink-0 rounded-lg p-0 text-muted"
          >
            <Info className="size-[18px]" aria-hidden />
          </Button>
          <Popover.Content
            placement="bottom"
            className="max-w-72 rounded-xl border border-border bg-surface p-3"
          >
            <Popover.Dialog
              className="text-xs leading-relaxed text-foreground"
              aria-label="时间与记录说明"
            >
              {description}
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </span>
    </>
  );
}

export function TokenUsageInfo() {
  return (
    <Popover>
      <Button
        data-testid="api-usage"
        aria-label="上传用法（尚未开放）"
        isIconOnly
        variant="ghost"
        className="size-11 min-w-11 rounded-lg p-0 text-muted"
      >
        <BookOpen className="size-[18px]" aria-hidden />
      </Button>
      <Popover.Content
        placement="bottom end"
        className="max-w-72 rounded-xl border border-border bg-surface p-4"
      >
        <Popover.Dialog className="grid gap-2 text-sm text-foreground">
          <Popover.Heading className="font-medium">
            上传用法尚未开放
          </Popover.Heading>
          <p className="text-xs leading-relaxed text-muted">
            公共上传接口交付后，这里将进入独立用法页面，提供上传命令和错误说明。
          </p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
