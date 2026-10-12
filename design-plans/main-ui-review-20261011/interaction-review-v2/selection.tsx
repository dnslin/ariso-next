/* eslint-disable @next/next/no-img-element -- Standalone prototype has no Next.js image server. */
import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { Popover } from '@heroui/react/popover';
import { ListChecks, ListX, CheckCheck, X, ChevronDown } from 'lucide-react';
import { IconButton, buttonClass, groupClass } from './ui';
import type { Photo } from './state';
export function SelectionManager({
  selected,
  items,
  onSelect,
}: {
  selected: Photo[];
  items: Photo[];
  onSelect: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const ids = selected.map((photo) => photo.id);
  const current = selected.filter((photo) =>
    items.some((item) => item.id === photo.id),
  ).length;
  function change(next: string[]) {
    if (next.length) heading.current?.focus({ preventScroll: true });
    else setOpen(false);
    onSelect(next);
    if (!next.length)
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLInputElement>('main input[type="search"]')
          ?.focus({ preventScroll: true });
      });
  }
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        ref={trigger}
        aria-label={`管理选择，已选 ${selected.length} 张`}
        variant="outline"
        className={`${buttonClass} px-3`}
      >
        <ListChecks size={17} aria-hidden />
        <span className="tabular-nums">{selected.length}</span>
        <ChevronDown size={14} aria-hidden />
      </Button>
      <Popover.Content
        placement="bottom end"
        className="w-[min(380px,calc(100vw-32px))] rounded-lg border border-border bg-surface p-4 shadow-lg"
      >
        <Popover.Dialog
          aria-label="选择管理"
          className="flex max-h-[min(440px,60dvh)] min-h-0 flex-col gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              ref={heading}
              tabIndex={-1}
              className="rounded text-sm outline-focus focus-visible:outline-2"
            >
              已选 {selected.length} 张
            </h2>
            <ButtonGroup
              aria-label="选择范围"
              variant="tertiary"
              className={groupClass}
            >
              <IconButton
                label="全选已加载"
                disabled={current === items.length}
                onPress={() =>
                  change([
                    ...new Set([...ids, ...items.map((item) => item.id)]),
                  ])
                }
              >
                <CheckCheck size={17} aria-hidden />
              </IconButton>
              <IconButton
                label="取消已加载选择"
                disabled={!current}
                onPress={() =>
                  change(
                    ids.filter((id) => !items.some((item) => item.id === id)),
                  )
                }
                separator
              >
                <ListX size={17} aria-hidden />
              </IconButton>
              <IconButton
                label="清空全部选择"
                disabled={!ids.length}
                onPress={() => change([])}
                separator
              >
                <X size={17} aria-hidden />
              </IconButton>
            </ButtonGroup>
          </div>
          <p className="text-xs text-muted">
            已加载 {current} 张
            {selected.length - current
              ? ` · 其他页 ${selected.length - current} 张`
              : ''}
          </p>
          <ul
            aria-label="已选清单"
            className="min-h-0 overflow-y-auto divide-y divide-border"
          >
            {selected.map((photo) => (
              <li
                key={photo.id}
                className="flex min-w-0 items-center gap-3 py-2"
              >
                <img
                  src={photo.src}
                  alt=""
                  className="size-11 shrink-0 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {photo.name}
                </span>
                <Button
                  isIconOnly
                  variant="ghost"
                  className="size-11 shrink-0 rounded-lg"
                  aria-label={`移除选择 ${photo.name}`}
                  onPress={() => change(ids.filter((id) => id !== photo.id))}
                >
                  <X size={16} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {!selected.length ? (
            <p className="py-5 text-center text-sm text-muted">未选择图片</p>
          ) : null}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
