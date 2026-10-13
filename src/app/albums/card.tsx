'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react/button';
import { Dropdown } from '@heroui/react/dropdown';
import { Link } from '@heroui/react/link';
import { Tooltip } from '@heroui/react/tooltip';
import { ArrowUpRight, Ellipsis, Pencil, Share2, Trash2 } from 'lucide-react';
import { AlbumCoverImage } from './cover-preview';
import type { Album } from './api';

export function AlbumCard({
  album,
  onOpen,
  onEdit,
  onShare,
  onDelete,
}: {
  album: Album;
  onOpen: () => void;
  onEdit: (opener: HTMLElement | null) => void;
  onShare: () => void;
  onDelete: (opener: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const source = useRef<HTMLElement | null>(null);
  const activated = useRef(false);
  function openContext(
    target: HTMLElement,
    position?: { x: number; y: number },
  ) {
    const rect = target.getBoundingClientRect();
    source.current = target;
    activated.current = false;
    setPoint(position ?? { x: rect.left + 16, y: rect.bottom - 8 });
    setOpen(true);
  }
  return (
    <article
      data-testid="album-card"
      className="relative min-w-0 rounded-[20px] border border-border bg-surface"
      onContextMenu={(event) => {
        event.preventDefault();
        const target = event.currentTarget.querySelector('a')!;
        openContext(target, { x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          openContext(event.target as HTMLElement);
        }
      }}
    >
      <Link
        href={`/albums/${album.id}`}
        data-testid={`album-${album.id}`}
        className="flex w-full min-w-0 flex-col items-stretch gap-3 rounded-[20px] p-4 text-foreground no-underline"
      >
        <span
          data-testid={`album-cover-${album.id}`}
          className="flex aspect-[333/184] w-full items-center justify-center overflow-hidden rounded-xl bg-default"
        >
          <AlbumCoverImage
            key={`${album.cover.imageId}-${album.cover.status}-${album.cover.thumbnailUrl}`}
            cover={album.cover}
          />
        </span>
        <span className="pr-11 text-base font-medium [overflow-wrap:anywhere]">
          {album.name}
        </span>
        <span className="text-xs font-normal text-muted">
          {album.imageCount} 张图片 · #{album.id.slice(0, 8)}
        </span>
      </Link>
      {point
        ? createPortal(
            <span
              ref={anchor}
              aria-hidden
              className="pointer-events-none fixed size-px"
              style={{ left: point.x, top: point.y }}
            />,
            document.body,
          )
        : null}
      <Dropdown
        isOpen={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            activated.current = false;
            if (!point) source.current = trigger.current;
          } else {
            setPoint(null);
            if (source.current && !activated.current)
              requestAnimationFrame(() =>
                source.current?.focus({ preventScroll: true }),
              );
          }
        }}
      >
        <Tooltip>
          <Button
            ref={trigger}
            aria-label={`相册操作：${album.name}`}
            isIconOnly
            variant="ghost"
            className="absolute right-3 bottom-8 size-11 min-w-11 rounded-lg bg-surface"
          >
            <Ellipsis size={18} aria-hidden />
          </Button>
          <Tooltip.Content>相册操作</Tooltip.Content>
        </Tooltip>
        <Dropdown.Popover
          triggerRef={point ? anchor : trigger}
          placement="bottom start"
          className="min-w-44 rounded-xl border border-border bg-surface p-1"
        >
          <Dropdown.Menu
            aria-label="相册操作"
            onAction={(key) => {
              activated.current = true;
              if (key === 'open') onOpen();
              else if (key === 'edit')
                onEdit(source.current ?? trigger.current);
              else if (key === 'share') onShare();
              else if (key === 'delete')
                onDelete(source.current ?? trigger.current);
            }}
          >
            <Dropdown.Item
              id="open"
              textValue="打开相册"
              className="min-h-11 gap-2 rounded-lg"
            >
              <ArrowUpRight size={17} aria-hidden />
              打开相册
            </Dropdown.Item>
            <Dropdown.Item
              id="edit"
              textValue="编辑相册"
              className="min-h-11 gap-2 rounded-lg"
            >
              <Pencil size={17} aria-hidden />
              编辑相册
            </Dropdown.Item>
            <Dropdown.Item
              id="share"
              textValue="分享设置"
              className="min-h-11 gap-2 rounded-lg"
            >
              <Share2 size={17} aria-hidden />
              分享设置
            </Dropdown.Item>
            <Dropdown.Item
              id="delete"
              textValue="删除相册"
              className="min-h-11 gap-2 rounded-lg text-danger"
            >
              <Trash2 size={17} aria-hidden />
              删除相册
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </article>
  );
}
