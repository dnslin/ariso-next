'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Dropdown } from '@heroui/react/dropdown';
import { Popover } from '@heroui/react/popover';
import { Pagination } from '@heroui/react/pagination';
import { ChevronDown, ImageOff, X } from 'lucide-react';
import type { LibraryLoadingMode } from './query-state';
import type {
  LibrarySelection,
  SelectedLibraryItem,
} from './use-library-selection';

const buttonClass = 'h-11 rounded-lg px-2 font-normal xl:h-9 xl:px-3';

function SelectedThumbnail({ item }: { item: SelectedLibraryItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-default">
      {item.storage.enabled && item.thumbnailUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOff size={18} aria-hidden />
      )}
    </div>
  );
}

export function LibrarySelectionMenu({
  selection,
  loadingMode,
  disabled,
  onOpen,
}: {
  selection: LibrarySelection;
  loadingMode: LibraryLoadingMode;
  disabled: boolean;
  onOpen: (id: string, element: HTMLElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const trigger = useRef<HTMLButtonElement>(null);
  const [boundary, setBoundary] = useState<HTMLElement | null>(null);
  const attachTrigger = useCallback((element: HTMLButtonElement | null) => {
    trigger.current = element;
    setBoundary(element?.closest('main') ?? null);
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const total = selection.selected.size;
  const pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = Math.min(page, pages);
  if (page !== currentPage) setPage(currentPage);
  if (!total && open) setOpen(false);
  const entries = [...selection.selected.values()].slice(
    (currentPage - 1) * 20,
    currentPage * 20,
  );
  const currentLabel = loadingMode === 'pages' ? '当前页' : '已加载';
  useEffect(() => {
    if (open) heading.current?.focus({ preventScroll: true });
  }, [open]);

  if (!total) return null;

  function focusSearch() {
    const search = trigger.current
      ?.closest('[data-testid="library-toolbar"]')
      ?.querySelector<HTMLInputElement>('input');
    requestAnimationFrame(() => search?.focus({ preventScroll: true }));
  }
  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <div
      className="relative inline-flex shrink-0"
      data-testid="library-selection"
    >
      <p role="status" className="sr-only">
        共选 {total} 张：{currentLabel} {selection.currentCount} 张
        {loadingMode === 'pages' ? `，其他页 ${selection.otherCount} 张` : ''}
      </p>
      <Dropdown>
        <Button
          ref={attachTrigger}
          variant="outline"
          className={buttonClass}
          isDisabled={disabled}
          aria-label={`操作已选 ${total} 张图片`}
        >
          已选 {total} 张
          <ChevronDown size={16} aria-hidden />
        </Button>
        <Dropdown.Popover className="rounded-xl border border-border bg-background dark:bg-surface">
          <p className="px-3 pt-2 pb-1 text-xs text-muted">
            {currentLabel} {selection.currentCount} 张
            {loadingMode === 'pages'
              ? ` · 其他页 ${selection.otherCount} 张`
              : ''}
          </p>
          <Dropdown.Menu
            aria-label="已选图片操作"
            disabledKeys={
              disabled
                ? [
                    'view',
                    'open',
                    'select-current',
                    'deselect-current',
                    'clear',
                  ]
                : []
            }
            onAction={(key) => {
              if (key === 'view') {
                setPage(1);
                setOpen(true);
              } else if (key === 'open') {
                const id = selection.selected.keys().next().value;
                if (id && trigger.current) onOpen(id, trigger.current);
              } else if (key === 'select-current') selection.selectCurrent();
              else if (key === 'deselect-current') {
                if (!selection.otherCount) focusSearch();
                selection.deselectCurrent();
              } else if (key === 'clear') {
                focusSearch();
                selection.clear();
              }
            }}
          >
            {total === 1 ? (
              <Dropdown.Item
                id="open"
                textValue="查看图片"
                className="min-h-11 xl:min-h-9"
              >
                查看图片
              </Dropdown.Item>
            ) : null}
            <Dropdown.Item
              id="view"
              textValue="查看已选清单"
              className="min-h-11 xl:min-h-9"
            >
              查看已选清单
            </Dropdown.Item>
            <Dropdown.Item
              id="select-current"
              textValue={`全选${currentLabel}`}
              isDisabled={selection.currentCount === selection.currentIds.size}
              className="min-h-11 xl:min-h-9"
            >
              全选{currentLabel}
            </Dropdown.Item>
            <Dropdown.Item
              id="deselect-current"
              textValue={`取消${currentLabel}选择`}
              isDisabled={selection.currentCount === 0}
              className="min-h-11 xl:min-h-9"
            >
              取消{currentLabel}选择
            </Dropdown.Item>
            <Dropdown.Item
              id="clear"
              textValue="清空全部选择"
              className="min-h-11 xl:min-h-9"
            >
              清空全部选择
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <Popover.Content
        isOpen={open}
        onOpenChange={setOpen}
        triggerRef={trigger}
        boundaryElement={boundary ?? undefined}
        isNonModal
        placement="bottom end"
        className="flex w-[min(380px,calc(100vw-32px))] max-w-none flex-col overflow-hidden rounded-xl border border-border bg-background p-3 shadow-lg dark:bg-surface"
      >
        <section
          id={panelId}
          role="region"
          data-testid="library-selected-panel"
          aria-labelledby={`${panelId}-title`}
          className="flex max-h-[min(28rem,40dvh)] min-h-0 flex-col gap-3"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <h2
              ref={heading}
              id={`${panelId}-title`}
              tabIndex={-1}
              className="rounded text-sm font-medium outline-focus focus-visible:outline-2"
            >
              已选清单 · {total} 张
            </h2>
            <Button
              aria-label="关闭已选清单"
              variant="ghost"
              isIconOnly
              className="size-11 min-w-0 rounded-lg xl:size-9"
              onPress={close}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
          <ul
            className="min-h-0 max-h-72 flex-1 divide-y divide-border overflow-y-auto"
            aria-label="已选图片"
          >
            {entries.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 py-2"
                data-selected-image-id={item.id}
              >
                <SelectedThumbnail item={item} />
                <Button
                  variant="ghost"
                  className="h-auto min-h-11 min-w-0 flex-1 items-start rounded-lg px-1 py-1 text-left font-normal"
                  isDisabled={disabled}
                  aria-label={`查看图片：${item.displayName}`}
                  onPress={(event) => {
                    if (event.target instanceof HTMLElement)
                      onOpen(item.id, event.target);
                  }}
                >
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate text-sm">{item.displayName}</span>
                    <span className="truncate text-xs text-muted">
                      {item.storage.name}
                      {!item.storage.enabled ? '（已停用）' : ''}
                      {loadingMode === 'pages'
                        ? ` · ${selection.currentIds.has(item.id) ? '当前页' : '其他页'}`
                        : ''}
                    </span>
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  isIconOnly
                  className="size-11 min-w-0 shrink-0 rounded-lg xl:size-9"
                  aria-label={`移除选择：${item.displayName}`}
                  isDisabled={disabled}
                  onPress={() => {
                    if (total === 1) focusSearch();
                    selection.remove(item.id);
                    if (total > 1)
                      requestAnimationFrame(() =>
                        heading.current?.focus({ preventScroll: true }),
                      );
                  }}
                >
                  <X size={16} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <Pagination aria-label="已选清单分页" className="shrink-0">
              <Pagination.Content className="w-full justify-between gap-2">
                <Pagination.Item>
                  <Pagination.Previous
                    className={buttonClass}
                    isDisabled={disabled || currentPage === 1}
                    onPress={() => setPage(currentPage - 1)}
                  >
                    上一页
                  </Pagination.Previous>
                </Pagination.Item>
                <Pagination.Item>
                  <Pagination.Summary className="text-xs">
                    {currentPage}/{pages}
                  </Pagination.Summary>
                </Pagination.Item>
                <Pagination.Item>
                  <Pagination.Next
                    className={buttonClass}
                    isDisabled={disabled || currentPage === pages}
                    onPress={() => setPage(currentPage + 1)}
                  >
                    下一页
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          ) : null}
        </section>
      </Popover.Content>
    </div>
  );
}
