'use client';

import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { Tooltip } from '@heroui/react/tooltip';
import { useMediaQuery } from '@heroui/react';
import { Info } from 'lucide-react';
import type { RefObject } from 'react';

const description =
  '超时或断线先到图库核对。等待超时不会取消处理；重复 POST 可能产生新图片。此接口没有公开轮询或幂等键。';
const buttonClass =
  'size-11 min-w-11 shrink-0 rounded-lg bg-transparent p-0 text-muted hover:bg-transparent';
const contentClass =
  'w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-border bg-surface px-4 py-3 text-[13px] leading-[1.7] text-foreground shadow-sm';

export function UsageTips({
  anchorRef,
}: {
  anchorRef: RefObject<Element | null>;
}) {
  const desktop = useMediaQuery('(min-width: 768px)', {
    initializeWithValue: false,
  });
  const button = (
    <Button
      aria-label="上传注意事项"
      isIconOnly
      variant="ghost"
      className={buttonClass}
    >
      <Info className="size-5" aria-hidden />
    </Button>
  );
  // Switching branches unmounts the old portal and its open state.
  if (desktop)
    return (
      <Tooltip delay={150} closeDelay={200}>
        {button}
        <Tooltip.Content
          triggerRef={anchorRef}
          placement="bottom start"
          offset={8}
          className={contentClass}
        >
          {description}
        </Tooltip.Content>
      </Tooltip>
    );
  return (
    <Popover>
      {button}
      <Popover.Content
        triggerRef={anchorRef}
        placement="bottom start"
        offset={8}
        className={contentClass}
      >
        <Popover.Dialog aria-label="上传注意事项" className="p-0">
          {description}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
