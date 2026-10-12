import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { CloseButton } from '@heroui/react/close-button';
import { Dropdown } from '@heroui/react/dropdown';
import { Modal } from '@heroui/react/modal';
import {
  ChevronDown,
  Copy,
  FolderInput,
  FolderMinus,
  Globe,
  ImageIcon,
  LockKeyhole,
  RefreshCw,
  Tag,
  Tags,
  Trash2,
} from 'lucide-react';
import { SearchInput, usePrototype } from './shared';
import { useCollections, type Photo } from './collection-state';

type Action =
  | 'open'
  | 'copy'
  | 'add-album'
  | 'remove-album'
  | 'public'
  | 'private'
  | 'add-tag'
  | 'remove-tag'
  | 'reprocess'
  | 'trash';
type ActionItem = { id: Action; label: string; icon: ReactNode };
export type ContextPosition = { x: number; y: number; target: HTMLElement };

export function eligibleActions(
  items: Photo[],
  compact: boolean,
): ActionItem[] {
  if (!items.length) return [];
  return [
    ...(compact && items.length === 1
      ? [
          {
            id: 'open' as const,
            label: '查看图片',
            icon: <ImageIcon size={16} />,
          },
        ]
      : []),
    { id: 'copy', label: '复制链接', icon: <Copy size={16} /> },
    { id: 'add-album', label: '加入相册', icon: <FolderInput size={16} /> },
    ...(items.some((photo) => photo.visibility === 'private')
      ? [
          {
            id: 'public' as const,
            label: '设为公开',
            icon: <Globe size={16} />,
          },
        ]
      : []),
    ...(items.some((photo) => photo.visibility === 'public')
      ? [
          {
            id: 'private' as const,
            label: '设为私有',
            icon: <LockKeyhole size={16} />,
          },
        ]
      : []),
    ...(items.some((photo) => photo.albumIds.length)
      ? [
          {
            id: 'remove-album' as const,
            label: '从相册移出',
            icon: <FolderMinus size={16} />,
          },
        ]
      : []),
    ...(!compact
      ? [
          {
            id: 'add-tag' as const,
            label: '添加标签',
            icon: <Tag size={16} />,
          },
          ...(items.some((photo) => photo.tags.length)
            ? [
                {
                  id: 'remove-tag' as const,
                  label: '移除标签',
                  icon: <Tags size={16} />,
                },
              ]
            : []),
          {
            id: 'reprocess' as const,
            label: '重新处理',
            icon: <RefreshCw size={16} />,
          },
        ]
      : []),
    { id: 'trash', label: '移入回收站', icon: <Trash2 size={16} /> },
  ];
}

export function CollectionActions({
  selected,
  albumId,
  context,
  onContextClose,
  onOpen,
  onRemoved,
}: {
  selected: Photo[];
  albumId?: string;
  context: ContextPosition | null;
  onContextClose: () => void;
  onOpen: (photo: Photo) => void;
  onRemoved: () => void;
}) {
  const { photos, setPhotos, albums, consumeFailure } = useCollections();
  const { notify } = usePrototype();
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const anchor = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const ids = selected.map((photo) => photo.id);
  const targetAction =
    action === 'add-album' ||
    action === 'remove-album' ||
    action === 'add-tag' ||
    action === 'remove-tag';
  const isAlbum = action === 'add-album' || action === 'remove-album';
  const options = isAlbum
    ? albums
        .filter(
          (album) =>
            action !== 'remove-album' ||
            selected.some((photo) => photo.albumIds.includes(album.id)),
        )
        .map((album) => ({ id: album.id, name: album.name }))
    : [
        ...new Set(
          action === 'remove-tag'
            ? selected.flatMap((photo) => photo.tags)
            : [
                '旅行',
                '风景',
                '日常',
                ...photos.flatMap((photo) => photo.tags),
              ],
        ),
      ].map((name) => ({ id: name, name }));
  const filteredOptions = options.filter((option) =>
    option.name.includes(query.trim()),
  );
  function close() {
    setAction(null);
    requestAnimationFrame(() => opener.current?.focus());
  }
  function apply(next: Action, chosen = targets) {
    if (consumeFailure(`batch-${next}`)) {
      setError('操作失败，已保留选择，请重试。');
      return;
    }
    let changed = 0;
    setPhotos(
      photos.flatMap((photo) => {
        if (!ids.includes(photo.id)) return [photo];
        if (next === 'trash') {
          changed++;
          return [];
        }
        if (next === 'public' || next === 'private') {
          if (photo.visibility !== next) changed++;
          return [{ ...photo, visibility: next }];
        }
        if (next === 'add-album')
          return [
            {
              ...photo,
              albumIds: [...new Set([...photo.albumIds, ...chosen])],
            },
          ];
        if (next === 'remove-album')
          return [
            {
              ...photo,
              albumIds: photo.albumIds.filter((id) => !chosen.includes(id)),
            },
          ];
        if (next === 'add-tag')
          return [{ ...photo, tags: [...new Set([...photo.tags, ...chosen])] }];
        if (next === 'remove-tag')
          return [
            {
              ...photo,
              tags: photo.tags.filter((tag) => !chosen.includes(tag)),
            },
          ];
        return [photo];
      }),
    );
    if (next === 'public' || next === 'private')
      notify(
        `已将 ${changed} 张图片设为${next === 'public' ? '公开' : '私有'}`,
      );
    else if (next === 'trash') notify(`已移入回收站 ${changed} 张图片`);
    else if (next === 'reprocess')
      notify(`已提交 ${selected.length} 张图片重新处理`);
    else
      notify(
        next === 'remove-album'
          ? '已从所选相册移出'
          : next === 'add-album'
            ? '已加入所选相册'
            : '标签已更新',
      );
    close();
    if (next === 'trash' || (next === 'remove-album' && albumId)) onRemoved();
  }
  async function choose(next: Action) {
    opener.current = context?.target ?? trigger.current;
    onContextClose();
    setMenuOpen(false);
    setError('');
    setQuery('');
    setTargets([]);
    if (next === 'open') {
      onOpen(selected[0]);
      return;
    }
    if (next === 'copy') {
      try {
        await navigator.clipboard.writeText(
          selected
            .map((photo) => `${window.location.origin}/images/${photo.id}`)
            .join('\n'),
        );
        notify(`已复制 ${selected.length} 个链接`);
      } catch {
        setAction(next);
        setError('复制失败，请选择下方地址手动复制。');
      }
      return;
    }
    if (next === 'remove-album' && albumId) {
      setTargets([albumId]);
    }
    setAction(next);
  }
  if (!selected.length) return null;
  const title = action
    ? (eligibleActions(selected, false).find((item) => item.id === action)
        ?.label ?? '复制链接')
    : '';
  return (
    <>
      {context ? (
        <span
          ref={anchor}
          className="pointer-events-none fixed size-px"
          style={{ left: context.x, top: context.y }}
          aria-hidden
        />
      ) : null}
      <Dropdown
        isOpen={!!context || menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) {
            const target = context?.target;
            onContextClose();
            target?.focus();
          }
        }}
      >
        <Button
          ref={trigger}
          variant="outline"
          className="prototype-button shrink-0"
          aria-label="已选图片操作"
          onPress={() => setMenuOpen(!menuOpen)}
        >
          操作
          <span className="min-[360px]:hidden">{selected.length}</span>
          <ChevronDown size={16} aria-hidden />
        </Button>
        <Dropdown.Popover
          triggerRef={context ? anchor : trigger}
          placement="bottom start"
          className="max-h-[calc(100dvh-32px)] min-w-48 overflow-y-auto rounded-xl border border-border bg-surface p-1.5"
        >
          <Dropdown.Menu
            aria-label={context ? '图片快捷操作' : '已选图片操作'}
            onAction={(key) => void choose(key as Action)}
          >
            {eligibleActions(selected, !!context).map((item) => (
              <Dropdown.Item
                key={item.id}
                id={item.id}
                textValue={item.label}
                className={`min-h-11 gap-3 rounded-lg px-3 text-sm ${item.id === 'trash' ? 'text-danger' : ''}`}
              >
                {item.icon}
                {item.label}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {action ? (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <Modal.Container size="sm" placement="center" className="p-4 sm:p-4">
            <Modal.Dialog
              className="mx-0 my-auto flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-120 flex-col gap-4 rounded-xl border border-border bg-surface p-5"
              data-testid="batch-dialog"
            >
              <Modal.Header className="flex flex-row items-center justify-between gap-3 text-left">
                <Modal.Heading className="text-lg font-medium">
                  {title}
                </Modal.Heading>
                <CloseButton
                  className="prototype-icon-button"
                  aria-label="关闭操作"
                  onPress={close}
                />
              </Modal.Header>
              <Modal.Body className="m-0 grid min-h-0 gap-3 overflow-y-auto p-0">
                <span className="text-sm text-muted">
                  已选 {selected.length} 张图片
                </span>
                {targetAction && !(action === 'remove-album' && albumId) ? (
                  <>
                    <SearchInput
                      label={isAlbum ? '搜索目标相册' : '搜索标签'}
                      value={query}
                      onChange={setQuery}
                    />
                    <div
                      className="grid gap-1"
                      aria-label={isAlbum ? '目标相册' : '目标标签'}
                    >
                      {filteredOptions.map((option) => (
                        <Checkbox
                          key={option.id}
                          isSelected={targets.includes(option.id)}
                          onChange={(checked) =>
                            setTargets((current) =>
                              checked
                                ? [...current, option.id]
                                : current.filter((id) => id !== option.id),
                            )
                          }
                          className="w-full rounded-lg"
                        >
                          <Checkbox.Content className="flex min-h-12 w-full items-center gap-3 px-3">
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                            <span className="min-w-0 break-words text-sm">
                              {option.name}
                            </span>
                          </Checkbox.Content>
                        </Checkbox>
                      ))}
                      {!filteredOptions.length ? (
                        <p
                          role="status"
                          className="py-6 text-center text-sm text-muted"
                        >
                          {query.trim()
                            ? isAlbum
                              ? '未找到相册'
                              : '未找到标签'
                            : isAlbum
                              ? '暂无相册'
                              : '暂无标签'}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : action === 'copy' ? (
                  <textarea
                    readOnly
                    aria-label="手动复制链接"
                    className="min-h-32 w-full break-all rounded-lg border border-border p-3 text-sm"
                    value={selected
                      .map(
                        (photo) =>
                          `${window.location.origin}/images/${photo.id}`,
                      )
                      .join('\n')}
                  />
                ) : (
                  <p className="text-sm">
                    {action === 'remove-album'
                      ? `从“${albums.find((album) => album.id === albumId)?.name}”移出，图片仍保留在图库。`
                      : action === 'public'
                        ? `将 ${selected.filter((photo) => photo.visibility === 'private').length} 张私有图片设为公开。`
                        : action === 'private'
                          ? `将 ${selected.filter((photo) => photo.visibility === 'public').length} 张公开图片设为私有。`
                          : action === 'trash'
                            ? '所选图片将移入回收站。'
                            : '使用当前处理规则重新处理所选图片。'}
                  </p>
                )}
                {error ? (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                ) : null}
              </Modal.Body>
              <Modal.Footer className="m-0 flex shrink-0 justify-end gap-3 p-0">
                <Button
                  variant="outline"
                  className="prototype-button min-w-24"
                  onPress={close}
                >
                  取消
                </Button>
                {action !== 'copy' ? (
                  <Button
                    className="prototype-button min-w-24"
                    isDisabled={targetAction && !targets.length}
                    onPress={() => apply(action)}
                  >
                    {error ? '重试' : '确认'}
                  </Button>
                ) : null}
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </>
  );
}
