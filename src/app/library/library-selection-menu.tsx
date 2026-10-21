'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { Tooltip } from '@heroui/react/tooltip';
import { Dropdown } from '@heroui/react/dropdown';
import { Popover } from '@heroui/react/popover';
import { Pagination } from '@heroui/react/pagination';
import {
  ChevronDown,
  CheckCheck,
  Copy,
  FolderInput,
  FolderDown,
  FolderMinus,
  Globe,
  Image as ImageIcon,
  ImageOff,
  LockKeyhole,
  ListChecks,
  ListX,
  MoreHorizontal,
  RefreshCw,
  Tag,
  Tags,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { batchLabels } from '../../components/library/use-library-batch';
import {
  selectionBatchActions,
  type SelectionBatchAction,
} from './library-actions';
import type { LibraryLoadingMode } from './query-state';
import type {
  LibrarySelection,
  SelectedLibraryItem,
} from './use-library-selection';
import {
  ActionIconButton,
  actionGroupClass,
} from '../../components/library/action-button';

export interface LibraryContextMenu {
  x: number;
  y: number;
  target: HTMLElement;
}

const actionIcons = {
  copy: Copy,
  archive: FolderDown,
  'add-albums': FolderInput,
  'remove-albums': FolderMinus,
  public: Globe,
  private: LockKeyhole,
  'add-tags': Tag,
  'remove-tags': Tags,
  reprocess: RefreshCw,
  trash: Trash2,
  restore: Undo2,
};
const buttonClass = 'h-11 rounded-lg px-2 font-normal xl:h-9 xl:px-3';

function actionLabel(action: SelectionBatchAction) {
  if (action === 'archive') return '打包下载';
  if (action === 'copy') return '复制链接';
  if (action === 'reprocess') return '重新处理';
  return batchLabels[action];
}

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
  pending = false,
  onOpen,
  contextMenu,
  onContextMenuClose,
  onBatch,
  onPermanentDelete,
  scope = 'normal',
}: {
  selection: LibrarySelection;
  loadingMode: LibraryLoadingMode;
  disabled: boolean;
  pending?: boolean;
  onOpen: (id: string, element: HTMLElement) => void;
  contextMenu?: LibraryContextMenu | null;
  onContextMenuClose?: () => void;
  onBatch?: (action: SelectionBatchAction, element: HTMLElement) => void;
  onPermanentDelete?: (element: HTMLElement) => void;
  scope?: 'normal' | 'trash';
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const contextAnchor = useRef<HTMLSpanElement>(null);
  const activatedContext = useRef<LibraryContextMenu | null>(null);
  const [page, setPage] = useState(1);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [boundary, setBoundary] = useState<HTMLElement | null>(null);
  const attachTrigger = useCallback((element: HTMLButtonElement | null) => {
    trigger.current = element;
    setBoundary(element?.closest('main') ?? null);
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const total = selection.selected.size;
  const blocked = disabled || pending;
  const allDeleting =
    scope === 'trash' &&
    [...selection.selected.values()].every(
      (item) => item.deletionStatus === 'deleting',
    );
  const actions: SelectionBatchAction[] =
    scope === 'trash'
      ? [...selection.selected.values()].some((item) => !item.deletionStatus)
        ? ['restore']
        : []
      : selectionBatchActions([...selection.selected.values()], !!contextMenu);
  const compact = !!contextMenu;
  const shortcutActions: SelectionBatchAction[] =
    scope === 'trash'
      ? ['restore']
      : ['copy', 'archive', 'add-albums', 'add-tags'];
  const menuActions = compact
    ? actions
    : actions.filter((action) => !shortcutActions.includes(action));
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
    const search = boundary?.querySelector<HTMLInputElement>(
      'input[type="search"]',
    );
    requestAnimationFrame(() => search?.focus({ preventScroll: true }));
  }
  function openPanel() {
    const element = trigger.current;
    if (pages > 1 && element && boundary) {
      const anchor = element.getBoundingClientRect();
      const bounds = boundary.getBoundingClientRect();
      // 44px heading + 44px footer + 60px row + gaps/padding and placement margin.
      const minimumHeight = 224;
      if (
        Math.max(anchor.top - bounds.top, bounds.bottom - anchor.bottom) <
        minimumHeight
      ) {
        element.scrollIntoView({
          block: 'start',
          inline: 'nearest',
          behavior: 'instant',
        });
        // React Aria closes overlays on ancestor scroll; open after that event.
        requestAnimationFrame(() => setOpen(true));
        setPage(1);
        return;
      }
    }
    setPage(1);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <div
      className="relative inline-flex shrink-0 flex-wrap items-center gap-2"
      data-testid="library-selection"
    >
      <p role="status" className="sr-only">
        共选 {total} 张：{currentLabel} {selection.currentCount} 张
        {loadingMode === 'pages' ? `，其他页 ${selection.otherCount} 张` : ''}
      </p>
      {contextMenu
        ? createPortal(
            <span
              ref={contextAnchor}
              aria-hidden
              className="pointer-events-none fixed size-px"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            />,
            document.body,
          )
        : null}
      <Button
        ref={attachTrigger}
        variant="outline"
        className="h-11 gap-2 rounded-lg px-3 font-normal"
        isDisabled={disabled}
        isPending={pending}
        aria-label={`管理选择，已选 ${total} 张`}
        aria-expanded={open}
        aria-controls={panelId}
        onPress={openPanel}
      >
        <ListChecks size={17} aria-hidden />
        <span className="tabular-nums">{total}</span>
        <ChevronDown size={14} aria-hidden />
      </Button>
      <ButtonGroup
        aria-label={scope === 'trash' ? '回收站快捷操作' : '图片快捷操作'}
        variant="tertiary"
        className={actionGroupClass}
      >
        {onBatch
          ? shortcutActions.map((action, index) => {
              const Icon = actionIcons[action];
              const label = actionLabel(action);
              return (
                <ActionIconButton
                  key={action}
                  label={label}
                  isDisabled={disabled || !actions.includes(action)}
                  isPending={pending}
                  onPress={(event) => {
                    if (event.target instanceof HTMLElement)
                      onBatch(action, event.target);
                  }}
                >
                  {index ? <ButtonGroup.Separator /> : null}
                  <Icon size={18} aria-hidden />
                </ActionIconButton>
              );
            })
          : null}
        {scope === 'trash' && onPermanentDelete ? (
          <ActionIconButton
            label="永久删除所选"
            className="text-danger"
            isDisabled={disabled || allDeleting}
            isPending={pending}
            onPress={(event) => {
              if (event.target instanceof HTMLElement)
                onPermanentDelete(event.target);
            }}
          >
            <ButtonGroup.Separator />
            <Trash2 size={18} aria-hidden />
          </ActionIconButton>
        ) : null}
        <Dropdown
          isOpen={!!contextMenu || menuOpen}
          onOpenChange={(next) => {
            setMenuOpen(next);
            if (!next) {
              const source = contextMenu?.target;
              onContextMenuClose?.();
              if (source && activatedContext.current !== contextMenu)
                requestAnimationFrame(() =>
                  source.focus({ preventScroll: true }),
                );
            }
          }}
        >
          <Tooltip closeDelay={0}>
            <Button
              ref={menuTrigger}
              variant="tertiary"
              isIconOnly
              className={`size-11 min-w-11 rounded-e-lg rounded-s-none p-0 ${scope === 'trash' && total > 1 ? 'hidden' : ''}`}
              isDisabled={disabled}
              isPending={pending}
              aria-label="更多图片操作"
            >
              <ButtonGroup.Separator />
              <MoreHorizontal size={18} aria-hidden />
            </Button>
            <Tooltip.Content>更多图片操作</Tooltip.Content>
          </Tooltip>
          <Dropdown.Popover
            triggerRef={contextMenu ? contextAnchor : menuTrigger}
            boundaryElement={boundary ?? undefined}
            placement="bottom start"
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-background dark:bg-surface"
          >
            {!compact ? (
              <p className="shrink-0 px-3 pt-2 pb-1 text-xs text-muted">
                {currentLabel} {selection.currentCount} 张
                {loadingMode === 'pages'
                  ? ` · 其他页 ${selection.otherCount} 张`
                  : ''}
              </p>
            ) : null}
            <Dropdown.Menu
              aria-label="已选图片操作"
              autoFocus={contextMenu ? 'first' : undefined}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              disabledKeys={blocked ? ['open'] : []}
              onAction={(key) => {
                activatedContext.current = contextMenu ?? null;
                if (key === 'delete-permanent') {
                  const target = contextMenu?.target ?? menuTrigger.current;
                  if (target) onPermanentDelete?.(target);
                } else if (actions.includes(key as SelectionBatchAction)) {
                  const target = contextMenu?.target ?? menuTrigger.current;
                  if (target) onBatch?.(key as SelectionBatchAction, target);
                } else if (key === 'open') {
                  const id = selection.selected.keys().next().value;
                  const target = contextMenu?.target ?? trigger.current;
                  if (id && target) onOpen(id, target);
                }
              }}
            >
              {compact && total === 1 ? (
                <Dropdown.Item
                  id="open"
                  textValue="查看图片"
                  className="min-h-11 gap-3 rounded-lg xl:min-h-9"
                >
                  <ImageIcon size={16} aria-hidden />
                  查看图片
                </Dropdown.Item>
              ) : null}
              {onBatch
                ? menuActions.map((action) => {
                    const Icon = actionIcons[action];
                    return (
                      <Dropdown.Item
                        key={action}
                        id={action}
                        textValue={actionLabel(action)}
                        isDisabled={blocked}
                        className={`min-h-11 gap-3 rounded-lg xl:min-h-9 ${action === 'trash' ? 'text-danger' : ''}`}
                      >
                        <Icon size={16} aria-hidden />
                        {actionLabel(action)}
                      </Dropdown.Item>
                    );
                  })
                : null}
              {compact && scope === 'trash' && onPermanentDelete ? (
                <Dropdown.Item
                  id="delete-permanent"
                  textValue="永久删除所选"
                  isDisabled={blocked || allDeleting}
                  className="min-h-11"
                >
                  永久删除所选
                </Dropdown.Item>
              ) : null}
              {!compact && total === 1 ? (
                <Dropdown.Item
                  id="open"
                  textValue="查看图片"
                  className="min-h-11 xl:min-h-9"
                >
                  查看图片
                </Dropdown.Item>
              ) : null}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </ButtonGroup>
      <Popover.Content
        isOpen={open}
        onOpenChange={setOpen}
        triggerRef={trigger}
        boundaryElement={boundary ?? undefined}
        isNonModal
        placement="bottom end"
        className="flex w-[min(380px,calc(100vw-32px))] max-w-none flex-col overflow-hidden rounded-lg border border-border bg-background p-3 shadow-lg dark:bg-surface"
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
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h2
              ref={heading}
              id={`${panelId}-title`}
              tabIndex={-1}
              className="rounded text-sm font-medium outline-focus focus-visible:outline-2"
            >
              已选清单 · {total} 张
            </h2>
            <ButtonGroup
              aria-label="选择范围"
              variant="tertiary"
              className={actionGroupClass}
            >
              <ActionIconButton
                label={`全选${currentLabel}`}
                isDisabled={
                  blocked ||
                  selection.currentCount === selection.currentIds.size
                }
                onPress={() => {
                  heading.current?.focus({ preventScroll: true });
                  selection.selectCurrent();
                }}
              >
                <CheckCheck size={17} aria-hidden />
              </ActionIconButton>
              <ActionIconButton
                label={`取消${currentLabel}选择`}
                isDisabled={blocked || !selection.currentCount}
                onPress={() => {
                  if (selection.otherCount)
                    heading.current?.focus({ preventScroll: true });
                  else {
                    setOpen(false);
                    focusSearch();
                  }
                  selection.deselectCurrent();
                }}
              >
                <ButtonGroup.Separator />
                <ListX size={17} aria-hidden />
              </ActionIconButton>
              <ActionIconButton
                label="清空全部选择"
                isDisabled={blocked}
                onPress={() => {
                  setOpen(false);
                  focusSearch();
                  selection.clear();
                }}
              >
                <ButtonGroup.Separator />
                <X size={17} aria-hidden />
              </ActionIconButton>
            </ButtonGroup>
          </div>
          <p className="shrink-0 text-xs text-muted">
            {currentLabel} {selection.currentCount} 张
            {loadingMode === 'pages'
              ? ` · 其他页 ${selection.otherCount} 张`
              : ''}
          </p>
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
                  isDisabled={blocked}
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
                    {item.batchFailure ? (
                      <span className="text-xs text-danger [overflow-wrap:anywhere]">
                        上次批量操作失败：{item.batchFailure}
                      </span>
                    ) : null}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  isIconOnly
                  className="size-11 min-w-0 shrink-0 rounded-lg xl:size-9"
                  aria-label={`移除选择：${item.displayName}`}
                  isDisabled={blocked}
                  onPress={() => {
                    if (total === 1) {
                      setOpen(false);
                      focusSearch();
                    } else heading.current?.focus({ preventScroll: true });
                    selection.remove(item.id);
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
                    isDisabled={blocked || currentPage === 1}
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
                    isDisabled={blocked || currentPage === pages}
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
