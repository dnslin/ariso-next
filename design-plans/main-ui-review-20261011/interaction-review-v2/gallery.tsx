/* eslint-disable @next/next/no-img-element -- Standalone prototype has no Next.js image server. */
import { useRef, type MouseEvent, type KeyboardEvent } from 'react';
import { Checkbox } from '@heroui/react/checkbox';
import { Button } from '@heroui/react/button';
import { Tooltip } from '@heroui/react/tooltip';
import { Folder, Check, MoreHorizontal, ImageOff } from 'lucide-react';
import {
  boxesIntersect,
  useSelectionContainer,
  type Box,
} from '@air/react-drag-to-select';
import { VisibilityBadge, iconClass } from './ui';
import type { Photo } from './state';
export type ContextPosition = { x: number; y: number; target: HTMLElement };
export type ContextEvent = MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>;
export function Gallery({
  items,
  selected,
  onSelect,
  onOpen,
  onContext,
  existing = [],
  picker = false,
  compact = false,
}: {
  items: Photo[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onOpen?: (photo: Photo) => void;
  onContext?: (photo: Photo, event: ContextEvent) => void;
  existing?: string[];
  picker?: boolean;
  compact?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const before = useRef<string[]>([]);
  const dragging = useRef(false);
  function selectBox(box: Box) {
    const ids = [
      ...(container.current?.querySelectorAll<HTMLElement>('[data-photo-id]') ??
        []),
    ]
      .filter((el) => boxesIntersect(box, el.getBoundingClientRect()))
      .map((el) => el.dataset.photoId!)
      .filter((id) => !existing.includes(id));
    onSelect([...new Set([...before.current, ...ids])]);
  }
  const { DragSelection } = useSelectionContainer({
    isEnabled: !picker,
    shouldStartSelecting: (target) =>
      target instanceof Element &&
      !!container.current?.contains(target) &&
      !target.closest('label,[role="checkbox"],input,[data-more]'),
    onSelectionStart: () => {
      before.current = selected;
      dragging.current = true;
    },
    onSelectionChange: selectBox,
    onSelectionEnd: () =>
      setTimeout(() => {
        dragging.current = false;
      }, 0),
    selectionProps: {
      'aria-hidden': true,
      style: {
        border: '1px solid var(--accent)',
        background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
        zIndex: 30,
      },
    },
  });
  function toggle(id: string) {
    onSelect(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  }
  return (
    <div
      ref={container}
      className="relative -mx-2 min-h-40 p-2 pb-8"
      data-testid="photo-gallery"
    >
      {!picker ? <DragSelection /> : null}
      <div
        className={`grid grid-cols-2 gap-3 md:gap-5 ${compact ? 'lg:grid-cols-4 xl:grid-cols-5' : 'lg:grid-cols-3 xl:grid-cols-4'}`}
      >
        {items.map((photo) => {
          const checked = selected.includes(photo.id);
          const added = existing.includes(photo.id);
          return (
            <article
              key={photo.id}
              data-photo-id={photo.id}
              data-selected={checked || undefined}
              className={`group relative min-w-0 overflow-hidden rounded-lg border bg-surface ${checked ? 'border-primary ring-2 ring-primary' : 'border-border'} ${added ? 'opacity-65' : ''}`}
              onContextMenu={(event) => {
                if (onContext) {
                  event.preventDefault();
                  onContext(photo, event);
                }
              }}
            >
              <button
                type="button"
                disabled={added}
                aria-label={`${picker ? (added ? '已添加' : checked ? '取消选择' : '选择') : '查看'} ${photo.name}`}
                className="block w-full text-left outline-offset-[-4px] focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => {
                  if (dragging.current) return;
                  if (picker || selected.length) toggle(photo.id);
                  else onOpen?.(photo);
                }}
                onKeyDown={(event) => {
                  if (onContext && event.shiftKey && event.key === 'F10') {
                    event.preventDefault();
                    onContext(photo, event);
                  }
                }}
              >
                <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-default">
                  {photo.deleting ? (
                    <ImageOff size={28} aria-hidden />
                  ) : (
                    <img
                      src={photo.src}
                      alt=""
                      draggable={false}
                      className="size-full object-cover"
                    />
                  )}
                </span>
                <span
                  className="block truncate px-3 pt-3 text-sm leading-6"
                  title={photo.name}
                >
                  {photo.name}
                </span>
              </button>
              <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-2 px-3 pt-1 pb-4 text-[11px] text-muted md:text-xs">
                <VisibilityBadge value={photo.visibility} />
                <span>{photo.size}</span>
                {photo.albumIds.length ? (
                  <Tooltip>
                    <span
                      tabIndex={0}
                      className="ml-auto inline-flex items-center gap-1"
                      aria-label={`${photo.albumIds.length} 本相册`}
                    >
                      <Folder size={13} aria-hidden />
                      {photo.albumIds.length}
                    </span>
                    <Tooltip.Content>
                      {photo.albumIds.length} 本相册
                    </Tooltip.Content>
                  </Tooltip>
                ) : null}
                {photo.deleting ? (
                  <span className="w-full text-danger">删除中</span>
                ) : null}
              </div>
              {added ? (
                <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-background/95 px-2 py-1 text-xs">
                  <Check size={13} aria-hidden />
                  已添加
                </span>
              ) : (
                <Checkbox
                  aria-label={`选择 ${photo.name}`}
                  isSelected={checked}
                  onChange={() => toggle(photo.id)}
                  className="absolute top-0 left-0"
                >
                  <Checkbox.Content className="flex size-11 items-center justify-center">
                    <Checkbox.Control className="border border-border bg-surface shadow-sm">
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              )}
              {onContext ? (
                <Tooltip>
                  <Button
                    data-more
                    isIconOnly
                    variant="ghost"
                    aria-label={`更多操作 ${photo.name}`}
                    className={`${iconClass} absolute top-0 right-0 bg-background/90 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`}
                    onPress={(event) => {
                      const target = event.target as HTMLElement;
                      const bounds = target.getBoundingClientRect();
                      onContext(photo, {
                        currentTarget: target,
                        clientX: bounds.left,
                        clientY: bounds.bottom,
                      } as MouseEvent<HTMLElement>);
                    }}
                  >
                    <MoreHorizontal size={18} aria-hidden />
                  </Button>
                  <Tooltip.Content>图片操作</Tooltip.Content>
                </Tooltip>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
