import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { Checkbox } from '@heroui/react/checkbox';
import { Dropdown } from '@heroui/react/dropdown';
import { toast } from '@heroui/react/toast';
import {
  Copy,
  FolderInput,
  FolderMinus,
  Globe,
  LockKeyhole,
  MoreHorizontal,
  Tag,
  Tags,
  RefreshCw,
  Trash2,
  Undo2,
  ImageIcon,
} from 'lucide-react';
import { useDataStore, type Photo } from './state';
import { TagDrawer } from './tag-drawer';
import {
  Dialog,
  IconButton,
  MenuItems,
  SearchInput,
  buttonClass,
  iconClass,
  groupClass,
  menuClass,
  type MenuItem,
} from './ui';
import type { ContextPosition } from './gallery';

export function eligibleActions(
  photos: Photo[],
  trash = false,
  compact = false,
): MenuItem[] {
  if (!photos.length) return [];
  if (trash)
    return [
      ...(photos.length === 1
        ? [{ id: 'open', label: '查看图片', icon: <ImageIcon size={17} /> }]
        : []),
      {
        id: 'restore',
        label: '恢复图片',
        icon: <Undo2 size={17} />,
        disabled: photos.every((photo) => photo.deleting),
      },
      {
        id: 'delete',
        label: '永久删除',
        icon: <Trash2 size={17} />,
        danger: true,
        disabled: photos.every((photo) => photo.deleting),
      },
    ];
  return [
    ...(compact && photos.length === 1
      ? [{ id: 'open', label: '查看图片', icon: <ImageIcon size={17} /> }]
      : []),
    { id: 'copy', label: '复制链接', icon: <Copy size={17} /> },
    { id: 'add-album', label: '添加到相册', icon: <FolderInput size={17} /> },
    ...(photos.some((photo) => photo.visibility === 'private')
      ? [{ id: 'public', label: '设为公开', icon: <Globe size={17} /> }]
      : []),
    ...(photos.some((photo) => photo.visibility === 'public')
      ? [{ id: 'private', label: '设为私有', icon: <LockKeyhole size={17} /> }]
      : []),
    ...(photos.some((photo) => photo.albumIds.length)
      ? [
          {
            id: 'remove-album',
            label: '从相册移出',
            icon: <FolderMinus size={17} />,
          },
        ]
      : []),
    ...(!compact
      ? [
          { id: 'add-tag', label: '添加标签', icon: <Tag size={17} /> },
          ...(photos.some((photo) => photo.tags.length)
            ? [
                {
                  id: 'remove-tag',
                  label: '移除标签',
                  icon: <Tags size={17} />,
                },
              ]
            : []),
          { id: 'reprocess', label: '重新处理', icon: <RefreshCw size={17} /> },
        ]
      : []),
    {
      id: 'trash',
      label: '移入回收站',
      icon: <Trash2 size={17} />,
      danger: true,
    },
  ];
}
export function PhotoActions({
  selected,
  trash = false,
  albumId,
  context,
  onContextClose,
  onOpen,
  onSelection,
}: {
  selected: Photo[];
  trash?: boolean;
  albumId?: string;
  context: ContextPosition | null;
  onContextClose: () => void;
  onOpen: (photo: Photo) => void;
  onSelection: (ids: string[]) => void;
}) {
  const { photos, setPhotos, albums, tags, createTag, consumeFailure } =
    useDataStore();
  const [action, setAction] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const ids = selected.map((photo) => photo.id);
  const full = eligibleActions(selected, trash);
  const overflowActions = full.filter((item) =>
    trash
      ? item.id === 'open'
      : !['copy', 'add-album', 'add-tag'].includes(item.id),
  );
  const menu = eligibleActions(selected, trash, !!context);
  function close() {
    setAction(null);
    setError('');
  }
  function apply(kind: string, chosen = targets) {
    const blocked = ['restore', 'delete'].includes(kind)
      ? selected.filter((photo) => photo.deleting).map((photo) => photo.id)
      : [];
    const eligible = ids.filter((id) => !blocked.includes(id));
    const failure = consumeFailure(`batch-${kind}`);
    const failedId = failure ? eligible[eligible.length - 1] : undefined;
    const completed = eligible.filter((id) => id !== failedId);
    setPhotos((current) =>
      current.map((photo) => {
        if (!completed.includes(photo.id)) return photo;
        if (kind === 'delete') return { ...photo, deleting: true };
        if (kind === 'trash') return { ...photo, trashed: true };
        if (kind === 'restore') return { ...photo, trashed: false };
        if (kind === 'public' || kind === 'private')
          return { ...photo, visibility: kind };
        if (kind === 'add-album')
          return {
            ...photo,
            albumIds: [...new Set([...photo.albumIds, ...chosen])],
          };
        if (kind === 'remove-album')
          return {
            ...photo,
            albumIds: photo.albumIds.filter((id) => !chosen.includes(id)),
          };
        if (kind === 'add-tag')
          return { ...photo, tags: [...new Set([...photo.tags, ...chosen])] };
        if (kind === 'remove-tag')
          return {
            ...photo,
            tags: photo.tags.filter((tag) => !chosen.includes(tag)),
          };
        return photo;
      }),
    );
    if (failedId) {
      onSelection([failedId, ...blocked]);
      setError(
        `${completed.length ? `已完成 ${completed.length} 张，` : ''}1 张操作失败${blocked.length ? `，${blocked.length} 张正在删除` : ''}，已保留选择。`,
      );
      return;
    }
    const label =
      kind === 'trash'
        ? `已移入回收站 ${completed.length} 张`
        : kind === 'restore'
          ? `已恢复 ${completed.length} 张`
          : kind === 'delete'
            ? `已提交 ${completed.length} 张永久删除`
            : kind === 'reprocess'
              ? '重新处理已提交'
              : kind === 'public'
                ? '已设为公开'
                : kind === 'private'
                  ? '已设为私有'
                  : kind.includes('tag')
                    ? '标签已更新'
                    : kind === 'add-album'
                      ? '已添加到相册'
                      : '已从相册移出';
    toast.success(
      `${label}${blocked.length ? `；${blocked.length} 张正在删除，已跳过并保留选择` : ''}`,
    );
    close();
    if (
      ['trash', 'restore', 'delete'].includes(kind) ||
      (kind === 'remove-album' && albumId)
    )
      onSelection(blocked);
  }
  async function choose(kind: string) {
    onContextClose();
    setMenuOpen(false);
    setTargets(kind === 'remove-album' && albumId ? [albumId] : []);
    setQuery('');
    setError('');
    if (kind === 'open') {
      onOpen(selected[0]);
      return;
    }
    if (kind === 'copy') {
      try {
        await navigator.clipboard.writeText(
          selected
            .map((photo) => `${window.location.origin}/i/${photo.id}`)
            .join('\n'),
        );
        toast.success(`已复制 ${ids.length} 个链接`);
      } catch {
        setAction('copy');
        setError('无法写入剪贴板，请手动复制。');
      }
      return;
    }
    if (kind === 'restore') {
      setAction(kind);
      apply(kind);
      return;
    }
    setAction(kind);
  }
  if (!ids.length) return null;
  const optionAlbums = albums
    .filter(
      (album) =>
        action !== 'remove-album' ||
        selected.some((photo) => photo.albumIds.includes(album.id)),
    )
    .filter((album) => album.name.includes(query));
  return (
    <>
      <ButtonGroup
        aria-label={trash ? '回收站快捷操作' : '图片快捷操作'}
        variant="tertiary"
        className={groupClass}
      >
        {trash ? (
          <>
            <IconButton
              label="恢复图片"
              disabled={selected.every((photo) => photo.deleting)}
              onPress={() => void choose('restore')}
            >
              <Undo2 size={18} />
            </IconButton>
            <IconButton
              label="永久删除"
              disabled={selected.every((photo) => photo.deleting)}
              onPress={() => void choose('delete')}
              separator
              className="text-danger"
            >
              <Trash2 size={18} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label="复制链接" onPress={() => void choose('copy')}>
              <Copy size={18} />
            </IconButton>
            <IconButton
              label="添加到相册"
              onPress={() => void choose('add-album')}
              separator
            >
              <FolderInput size={18} />
            </IconButton>
            <IconButton
              label="添加标签"
              onPress={() => void choose('add-tag')}
              separator
            >
              <Tag size={18} />
            </IconButton>
          </>
        )}
        {overflowActions.length ? (
          <Dropdown isOpen={menuOpen} onOpenChange={setMenuOpen}>
            <Button
              ref={trigger}
              isIconOnly
              variant="tertiary"
              aria-label="更多图片操作"
              className={iconClass}
            >
              <ButtonGroup.Separator />
              <MoreHorizontal size={18} />
            </Button>
            <Dropdown.Popover className={menuClass} placement="bottom end">
              <MenuItems
                label="更多图片操作"
                items={overflowActions}
                onAction={(kind) => void choose(kind)}
              />
            </Dropdown.Popover>
          </Dropdown>
        ) : null}
      </ButtonGroup>
      {context ? (
        <>
          <span
            ref={anchor}
            aria-hidden
            className="pointer-events-none fixed size-px"
            style={{ left: context.x, top: context.y }}
          />
          <Dropdown
            isOpen
            onOpenChange={(open) => {
              if (!open) {
                onContextClose();
                context.target.focus({ preventScroll: true });
              }
            }}
          >
            <Button className="sr-only" aria-label="右键菜单来源" />
            <Dropdown.Popover
              triggerRef={anchor}
              placement="bottom start"
              className={menuClass}
            >
              <MenuItems
                label={trash ? '回收站右键操作' : '图片右键操作'}
                items={menu}
                onAction={(kind) => void choose(kind)}
              />
            </Dropdown.Popover>
          </Dropdown>
        </>
      ) : null}
      {action === 'add-tag' || action === 'remove-tag' ? (
        <TagDrawer
          key={action}
          isOpen
          error={error}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          selectedCount={ids.length}
          tags={tags
            .filter(
              (tag) =>
                action !== 'remove-tag' ||
                selected.some((photo) => photo.tags.includes(tag)),
            )
            .map((name) => ({
              id: name,
              name,
              count: photos.filter(
                (photo) => !photo.trashed && photo.tags.includes(name),
              ).length,
            }))}
          mode={action === 'remove-tag' ? 'remove' : 'add'}
          onCreate={createTag}
          onApply={(chosen) => apply(action, chosen)}
        />
      ) : null}
      {action && action !== 'add-tag' && action !== 'remove-tag' ? (
        <Dialog
          title={full.find((item) => item.id === action)?.label ?? '恢复图片'}
          onClose={close}
          footer={
            <>
              <Button variant="outline" className={buttonClass} onPress={close}>
                取消
              </Button>
              {action !== 'copy' ? (
                <Button
                  variant={action === 'delete' ? 'danger' : 'primary'}
                  className={buttonClass}
                  isDisabled={
                    (action === 'add-album' || action === 'remove-album') &&
                    !targets.length
                  }
                  onPress={() => apply(action)}
                >
                  {error ? '重试' : action === 'delete' ? '永久删除' : '确认'}
                </Button>
              ) : null}
            </>
          }
        >
          <div className="grid gap-4">
            <p className="text-sm text-muted">已选 {ids.length} 张图片</p>
            {action === 'add-album' || action === 'remove-album' ? (
              <>
                <SearchInput
                  label="搜索相册"
                  value={query}
                  onChange={setQuery}
                />
                <div className="grid gap-1">
                  {optionAlbums.map((album) => (
                    <Checkbox
                      key={album.id}
                      isSelected={targets.includes(album.id)}
                      onChange={(checked) =>
                        setTargets((current) =>
                          checked
                            ? [...current, album.id]
                            : current.filter((id) => id !== album.id),
                        )
                      }
                    >
                      <Checkbox.Content className="flex min-h-12 items-center gap-3 rounded-md px-3">
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <span className="text-sm">{album.name}</span>
                      </Checkbox.Content>
                    </Checkbox>
                  ))}
                  {!optionAlbums.length ? (
                    <p className="py-6 text-center text-sm text-muted">
                      暂无可选相册
                    </p>
                  ) : null}
                </div>
              </>
            ) : action === 'copy' ? (
              <textarea
                readOnly
                aria-label="手动复制链接"
                className="min-h-32 w-full rounded-lg border border-border p-3 text-sm"
                value={selected
                  .map((photo) => `${window.location.origin}/i/${photo.id}`)
                  .join('\n')}
              />
            ) : (
              <p className="text-sm">
                {action === 'trash'
                  ? '图片可在回收站恢复。'
                  : action === 'delete'
                    ? '永久删除后无法恢复。'
                    : action === 'public'
                      ? '私有图片将可以通过公开链接访问。'
                      : action === 'private'
                        ? '公开图片的外链将不可访问。'
                        : action === 'restore'
                          ? '恢复后图片回到图库。'
                          : '使用当前处理规则重新处理。'}
              </p>
            )}
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-danger/10 p-3 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
