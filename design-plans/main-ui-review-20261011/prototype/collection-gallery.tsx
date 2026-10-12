import { useRef, type MouseEvent, type KeyboardEvent } from 'react';
import { Checkbox } from '@heroui/react/checkbox';
import { Tooltip } from '@heroui/react/tooltip';
import { Globe, LockKeyhole, Folder, Check } from 'lucide-react';
import {
  boxesIntersect,
  useSelectionContainer,
  type Box,
} from '@air/react-drag-to-select';
import type { Photo } from './collection-state';

/* eslint-disable @next/next/no-img-element -- Standalone prototype image assets. */
export function CollectionGallery({
  items,
  selected,
  onSelect,
  onOpen,
  onContext,
  existing = [],
  picker = false,
}: {
  items: Photo[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onOpen?: (photo: Photo) => void;
  onContext?: (
    photo: Photo,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) => void;
  existing?: string[];
  picker?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const before = useRef<string[]>([]);
  const latest = useRef<Box | null>(null);
  const dragging = useRef(false);
  function selectBox(box: Box) {
    const ids = [
      ...(container.current?.querySelectorAll<HTMLElement>('[data-photo-id]') ??
        []),
    ]
      .filter((element) => boxesIntersect(box, element.getBoundingClientRect()))
      .map((element) => element.dataset.photoId!)
      .filter((id) => !existing.includes(id));
    onSelect([...new Set([...before.current, ...ids])]);
  }
  const { DragSelection } = useSelectionContainer({
    isEnabled: !picker,
    shouldStartSelecting: (target) =>
      target instanceof Element &&
      !!container.current?.contains(target) &&
      !target.closest('label, [role="checkbox"], input'),
    onSelectionStart: () => {
      before.current = selected;
      dragging.current = true;
    },
    isValidSelectionStart: (box) => {
      latest.current = box;
      return Math.hypot(box.width, box.height) >= 5;
    },
    onSelectionChange: selectBox,
    onSelectionEnd: () => {
      if (latest.current && container.current && dragging.current) {
        const origin = container.current.getBoundingClientRect();
        selectBox({
          ...latest.current,
          top: latest.current.top + origin.top,
          left: latest.current.left + origin.left,
        });
      }
      setTimeout(() => {
        dragging.current = false;
      }, 0);
    },
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
      className="relative -mx-3 min-h-40 p-3"
      data-testid="collection-gallery"
    >
      {!picker ? <DragSelection /> : null}
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((photo) => {
          const added = existing.includes(photo.id);
          const checked = selected.includes(photo.id);
          return (
            <article
              key={photo.id}
              data-photo-id={photo.id}
              className="group relative min-w-0"
              onContextMenu={(event) => {
                if (onContext) {
                  event.preventDefault();
                  onContext(photo, event);
                }
              }}
            >
              <button
                type="button"
                className={`grid w-full min-w-0 gap-2 rounded-lg text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus ${added ? 'opacity-60' : ''}`}
                aria-label={
                  picker
                    ? `${added ? '已添加' : checked ? '取消选择' : '选择'} ${photo.name}`
                    : `查看 ${photo.name}`
                }
                disabled={added}
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
                <span
                  className={`relative block aspect-[4/3] overflow-hidden rounded-lg border-2 ${checked ? 'border-accent' : 'border-transparent'}`}
                >
                  <img
                    src={photo.src}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                  />
                </span>
                <span className="truncate text-sm">{photo.name}</span>
              </button>
              {added ? (
                <span className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-background/95 px-2 py-1 text-xs">
                  <Check size={13} aria-hidden />
                  已添加
                </span>
              ) : (
                <Checkbox
                  aria-label={`选择 ${photo.name}`}
                  isSelected={checked}
                  onChange={() => toggle(photo.id)}
                  className="absolute top-1 left-1"
                >
                  <Checkbox.Content className="flex size-11 items-center justify-center rounded-lg">
                    <Checkbox.Control className="border border-border bg-background shadow-sm">
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              )}
              {!picker ? (
                <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted">
                  <span className="min-w-0 flex-1 truncate">{photo.size}</span>
                  {photo.albumIds.length ? (
                    <Tooltip>
                      <span
                        tabIndex={0}
                        aria-label={`属于 ${photo.albumIds.length} 本相册`}
                        className="inline-flex items-center gap-1"
                      >
                        <Folder size={13} aria-hidden />
                        {photo.albumIds.length}
                      </span>
                      <Tooltip.Content>
                        {photo.albumIds.length} 本相册
                      </Tooltip.Content>
                    </Tooltip>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    {photo.visibility === 'public' ? (
                      <Globe size={13} aria-hidden />
                    ) : (
                      <LockKeyhole size={13} aria-hidden />
                    )}
                    {photo.visibility === 'public' ? '公开' : '私有'}
                  </span>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
