/* eslint-disable @next/next/no-img-element -- Standalone prototype has no Next.js image server. */
import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { Dropdown } from '@heroui/react/dropdown';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { toast } from '@heroui/react/toast';
import {
  Folder,
  Plus,
  ChevronDown,
  CloudUpload,
  Images,
  Pencil,
  ImageIcon,
  MoreHorizontal,
  Link2,
  Trash2,
  LayoutGrid,
  Grid2X2,
  RefreshCw,
  Tags,
  ArrowDown,
} from 'lucide-react';
import { Gallery, type ContextPosition, type ContextEvent } from './gallery';
import { PhotoActions } from './actions';
import { SelectionManager } from './selection';
import { useDataStore, type Photo, type Album } from './state';
import {
  Header,
  Footer,
  Dialog,
  IconButton,
  MenuItems,
  SearchInput,
  SelectField,
  EmptyState,
  VisibilityBadge,
  useApp,
  buttonClass,
  iconClass,
  groupClass,
  menuClass,
} from './ui';
import { ShareEditor } from './share-editor';

function NameEditor({
  title,
  value = '',
  onSave,
  onClose,
}: {
  title: string;
  value?: string;
  onSave: (name: string) => string | undefined;
  onClose: () => void;
}) {
  const [name, setName] = useState(value);
  const [error, setError] = useState('');
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" className={buttonClass} onPress={onClose}>
            取消
          </Button>
          <Button className={buttonClass} type="submit" form="name-editor">
            {value ? '保存' : '创建'}
          </Button>
        </>
      }
    >
      <form
        id="name-editor"
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setError('请输入名称');
            return;
          }
          const result = onSave(name.trim().normalize('NFC'));
          if (result) setError(result);
        }}
      >
        <TextField
          value={name}
          onChange={(next) => {
            setName(next);
            setError('');
          }}
          isInvalid={!!error}
        >
          <Label>名称</Label>
          <Input
            autoFocus
            maxLength={100}
            className="h-12 rounded-lg border border-border bg-background px-3"
          />
        </TextField>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

export function PhotoPage({
  album,
  trash = false,
}: {
  album?: Album;
  trash?: boolean;
}) {
  const { navigate } = useApp();
  const { photos, setAlbums } = useDataStore();
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [compact, setCompact] = useState(false);
  const [ascending, setAscending] = useState(false);
  const [context, setContext] = useState<ContextPosition | null>(null);
  const [view, setView] = useState<Photo | null>(null);
  const [picker, setPicker] = useState(false);
  const [edit, setEdit] = useState(false);
  const [cover, setCover] = useState(false);
  const [deleteAlbum, setDeleteAlbum] = useState(false);
  const [size, setSize] = useState('40');
  const scoped = photos.filter(
    (photo) =>
      !!photo.trashed === trash &&
      (!album || photo.albumIds.includes(album.id)),
  );
  const filtered = scoped.filter(
    (photo) =>
      photo.name.includes(query) &&
      (visibility === 'all' || photo.visibility === visibility),
  );
  const sorted = ascending ? [...filtered].reverse() : filtered;
  const items = sorted.slice(0, Number(size));
  const chosen = photos.filter((photo) => selected.includes(photo.id));
  function openContext(photo: Photo, event: ContextEvent) {
    const target =
      event.currentTarget.querySelector<HTMLButtonElement>('button') ??
      event.currentTarget;
    const box = target.getBoundingClientRect();
    if (!selected.includes(photo.id)) setSelected([photo.id]);
    setContext({
      x: 'clientX' in event ? event.clientX : box.left + 12,
      y: 'clientY' in event ? event.clientY : box.bottom,
      target,
    });
  }
  function resetQuery(value: string) {
    setQuery(value);
    setSelected([]);
    setContext(null);
  }
  const source = `/albums/${album?.id ?? ''}`;
  return (
    <div className="grid min-w-0 gap-6 pb-8">
      <Header
        title={album?.name ?? (trash ? '回收站' : '图库')}
        back={album ? () => navigate('/albums') : undefined}
      />
      {album ? (
        <>
          <p className="-mt-3 text-sm text-muted">
            {scoped.length} 张图片 ·{' '}
            {scoped.filter((photo) => photo.visibility === 'public').length}{' '}
            张公开
          </p>
          <div
            className="flex flex-wrap items-center justify-between gap-3"
            data-testid="album-operation-bar"
          >
            <ButtonGroup
              aria-label="相册操作"
              variant="tertiary"
              className={groupClass}
            >
              <IconButton label="编辑相册" onPress={() => setEdit(true)}>
                <Pencil size={18} />
              </IconButton>
              <IconButton
                label="设置封面"
                onPress={() => setCover(true)}
                separator
              >
                <ImageIcon size={18} />
              </IconButton>
              <IconButton
                label="分享设置"
                onPress={() => navigate(`/shares/${album.id}?from=album`)}
                separator
              >
                <Link2 size={18} />
              </IconButton>
              <Dropdown>
                <Button
                  isIconOnly
                  variant="tertiary"
                  aria-label="更多相册操作"
                  className={iconClass}
                >
                  <ButtonGroup.Separator />
                  <MoreHorizontal size={18} />
                </Button>
                <Dropdown.Popover className={menuClass}>
                  <MenuItems
                    label="更多相册操作"
                    items={[
                      {
                        id: 'delete',
                        label: '删除相册',
                        icon: <Trash2 size={17} />,
                        danger: true,
                      },
                    ]}
                    onAction={() => setDeleteAlbum(true)}
                  />
                </Dropdown.Popover>
              </Dropdown>
            </ButtonGroup>
            <Dropdown>
              <Button className={buttonClass} aria-label="添加图片">
                <Plus size={18} />
                添加图片
                <ChevronDown size={15} />
              </Button>
              <Dropdown.Popover className={menuClass} placement="bottom end">
                <MenuItems
                  label="添加图片方式"
                  items={[
                    {
                      id: 'upload',
                      label: '上传新图片',
                      icon: <CloudUpload size={17} />,
                    },
                    {
                      id: 'library',
                      label: '从图库选择',
                      icon: <Images size={17} />,
                    },
                  ]}
                  onAction={(key) =>
                    key === 'upload'
                      ? navigate(
                          `/upload?albumId=${encodeURIComponent(album.id)}&returnTo=${encodeURIComponent(source)}`,
                        )
                      : setPicker(true)
                  }
                />
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </>
      ) : null}
      <div
        className="flex min-w-0 flex-wrap items-center gap-3"
        data-testid="photo-toolbar"
      >
        <div className="w-full sm:max-w-96 sm:min-w-56 sm:flex-1">
          <SearchInput
            label="搜索图片"
            placeholder="搜索图片名称"
            value={query}
            onChange={resetQuery}
          />
        </div>
        <Button
          variant="outline"
          aria-label={ascending ? '按时间升序' : '按时间降序'}
          className={`${buttonClass} px-3`}
          onPress={() => setAscending(!ascending)}
        >
          {album ? '加入时间' : trash ? '回收时间' : '上传时间'}
          <ArrowDown size={15} className={ascending ? 'rotate-180' : ''} />
        </Button>
        <ButtonGroup
          aria-label="图片布局"
          variant="tertiary"
          className={groupClass}
        >
          <IconButton
            label="标准网格"
            variant={!compact ? 'primary' : 'tertiary'}
            onPress={() => setCompact(false)}
          >
            <LayoutGrid size={17} />
          </IconButton>
          <IconButton
            label="紧凑网格"
            variant={compact ? 'primary' : 'tertiary'}
            onPress={() => setCompact(true)}
            separator
          >
            <Grid2X2 size={17} />
          </IconButton>
        </ButtonGroup>
        <SelectField
          label="可见性"
          value={visibility}
          onChange={(next) => {
            setVisibility(next);
            setSelected([]);
          }}
          options={[
            { id: 'all', label: '全部' },
            { id: 'public', label: '公开' },
            { id: 'private', label: '私有' },
          ]}
          className="w-28 [&>.label]:sr-only [&_.select__trigger]:h-11"
        />
        {trash ? (
          <Button
            isIconOnly
            aria-label="刷新回收站"
            variant="ghost"
            className={iconClass}
            onPress={() => toast('回收站已刷新')}
          >
            <RefreshCw size={18} />
          </Button>
        ) : null}
        {chosen.length ? (
          <div
            className="flex flex-wrap items-center gap-3 sm:ml-auto"
            data-testid="selection-operation-bar"
          >
            <SelectionManager
              selected={chosen}
              items={items}
              onSelect={setSelected}
            />
            <PhotoActions
              selected={chosen}
              albumId={album?.id}
              trash={trash}
              context={context}
              onContextClose={() => setContext(null)}
              onOpen={setView}
              onSelection={setSelected}
            />
          </div>
        ) : null}
      </div>
      {items.length ? (
        <Gallery
          items={items}
          compact={compact}
          selected={selected}
          onSelect={setSelected}
          onOpen={setView}
          onContext={openContext}
        />
      ) : (
        <EmptyState
          icon={trash ? <Trash2 /> : <Images />}
          title={
            query || visibility !== 'all'
              ? '未找到图片'
              : trash
                ? '回收站为空'
                : '暂无图片'
          }
        />
      )}
      <Footer>
        <span className="mr-auto text-sm text-muted">
          {scoped.length} 张图片 · 已加载 {items.length} 张
        </span>
        <SelectField
          label="每批数量"
          value={size}
          onChange={setSize}
          options={[
            { id: '20', label: '20 张 / 批' },
            { id: '40', label: '40 张 / 批' },
            { id: '80', label: '80 张 / 批' },
          ]}
          className="w-32 [&>.label]:sr-only [&_.select__trigger]:h-11"
        />
      </Footer>
      {view ? (
        <Dialog title={view.name} onClose={() => setView(null)}>
          <img
            src={view.src}
            alt={view.name}
            className="max-h-[60dvh] w-full object-contain"
          />
          <div className="mt-4 flex items-center gap-3 text-sm text-muted">
            <VisibilityBadge value={view.visibility} />
            {view.size}
            {view.trashed ? <span>回收站预览</span> : null}
          </div>
        </Dialog>
      ) : null}
      {picker && album ? (
        <AlbumPicker album={album} onClose={() => setPicker(false)} />
      ) : null}
      {edit && album ? (
        <NameEditor
          title="编辑相册"
          value={album.name}
          onClose={() => setEdit(false)}
          onSave={(name) => {
            setAlbums((current) =>
              current.map((item) =>
                item.id === album.id ? { ...item, name } : item,
              ),
            );
            setEdit(false);
            toast.success('相册已更新');
            return undefined;
          }}
        />
      ) : null}
      {cover && album ? (
        <Dialog
          title="设置封面"
          onClose={() => setCover(false)}
          footer={
            <Button
              variant="outline"
              className={buttonClass}
              onPress={() => {
                setAlbums((current) =>
                  current.map((item) =>
                    item.id === album.id
                      ? { ...item, coverId: undefined }
                      : item,
                  ),
                );
                setCover(false);
                toast.success('已使用自动封面');
              }}
            >
              自动封面
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {scoped.map((photo) => (
              <button
                key={photo.id}
                type="button"
                aria-label={`设为封面 ${photo.name}`}
                className="overflow-hidden rounded-lg border border-border text-left"
                onClick={() => {
                  setAlbums((current) =>
                    current.map((item) =>
                      item.id === album.id
                        ? { ...item, coverId: photo.id }
                        : item,
                    ),
                  );
                  setCover(false);
                  toast.success('封面已更新');
                }}
              >
                <img
                  src={photo.src}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="block truncate p-3 text-sm">{photo.name}</span>
              </button>
            ))}
          </div>
          {!scoped.length ? (
            <p className="py-8 text-center text-sm text-muted">暂无可选图片</p>
          ) : null}
        </Dialog>
      ) : null}
      {deleteAlbum && album ? (
        <DeleteAlbum album={album} onClose={() => setDeleteAlbum(false)} />
      ) : null}
    </div>
  );
}

function AlbumPicker({
  album,
  onClose,
}: {
  album: Album;
  onClose: () => void;
}) {
  const { photos, setPhotos, consumeFailure } = useDataStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const items = photos.filter(
    (photo) => !photo.trashed && photo.name.includes(query),
  );
  return (
    <Dialog
      title="从图库选择"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-sm text-muted">
            已选 {selected.length} 张
          </span>
          <Button variant="outline" className={buttonClass} onPress={onClose}>
            取消
          </Button>
          <Button
            className={buttonClass}
            isDisabled={!selected.length}
            onPress={() => {
              if (consumeFailure('picker')) {
                setError('添加失败，已保留选择。');
                return;
              }
              setPhotos((current) =>
                current.map((photo) =>
                  selected.includes(photo.id)
                    ? {
                        ...photo,
                        albumIds: [...new Set([...photo.albumIds, album.id])],
                      }
                    : photo,
                ),
              );
              toast.success(`已添加 ${selected.length} 张图片`);
              onClose();
            }}
          >
            <Plus size={17} />
            {error ? '重试' : '添加'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <span className="text-sm text-muted">{album.name}</span>
        <SearchInput label="搜索图库图片" value={query} onChange={setQuery} />
        {items.length ? (
          <Gallery
            items={items}
            selected={selected}
            onSelect={setSelected}
            existing={photos
              .filter((photo) => photo.albumIds.includes(album.id))
              .map((photo) => photo.id)}
            picker
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted">未找到图片</p>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function DeleteAlbum({
  album,
  onClose,
}: {
  album: Album;
  onClose: () => void;
}) {
  const { setAlbums, setPhotos } = useDataStore();
  const { navigate } = useApp();
  return (
    <Dialog
      title="删除相册"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" className={buttonClass} onPress={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            className={buttonClass}
            onPress={() => {
              setAlbums((current) =>
                current.filter((item) => item.id !== album.id),
              );
              setPhotos((current) =>
                current.map((photo) => ({
                  ...photo,
                  albumIds: photo.albumIds.filter((id) => id !== album.id),
                })),
              );
              toast.success('相册已删除，图片仍保留在图库');
              onClose();
              navigate('/albums');
            }}
          >
            删除
          </Button>
        </>
      }
    >
      <p className="text-sm">删除“{album.name}”，不会删除其中的图片。</p>
    </Dialog>
  );
}

export function AlbumsPage({ id }: { id?: string }) {
  const { navigate } = useApp();
  const { albums, setAlbums, photos } = useDataStore();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Album | null>(null);
  const [deleting, setDeleting] = useState<Album | null>(null);
  const [context, setContext] = useState<
    (ContextPosition & { album: Album }) | null
  >(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const album = albums.find((item) => item.id === id);
  if (album) return <PhotoPage key={album.id} album={album} />;
  const filtered = albums.filter((item) => item.name.includes(query));
  return (
    <div className="grid min-w-0 gap-6 pb-8">
      <Header title="相册" />
      <div className="flex min-w-0 items-center gap-3">
        <SearchInput label="搜索相册" value={query} onChange={setQuery} />
        <Button
          className={`${buttonClass} shrink-0`}
          onPress={() => setCreating(true)}
        >
          <Plus size={18} />
          新建相册
        </Button>
      </div>
      {filtered.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const members = photos.filter(
              (photo) => !photo.trashed && photo.albumIds.includes(item.id),
            );
            const cover =
              members.find((photo) => photo.id === item.coverId) ?? members[0];
            function open(event: ContextEvent) {
              const target = event.currentTarget;
              const box = target.getBoundingClientRect();
              setContext({
                album: item,
                target,
                x: 'clientX' in event ? event.clientX : box.left + 16,
                y: 'clientY' in event ? event.clientY : box.top + 40,
              });
            }
            return (
              <article
                key={item.id}
                className="group relative min-w-0"
                onContextMenu={(event) => {
                  event.preventDefault();
                  open(event);
                }}
              >
                <button
                  type="button"
                  className="grid w-full min-w-0 gap-2 rounded-lg text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
                  aria-label={`打开相册 ${item.name}`}
                  onClick={() => navigate(`/albums/${item.id}`)}
                  onKeyDown={(event) => {
                    if (event.shiftKey && event.key === 'F10') {
                      event.preventDefault();
                      open(event);
                    }
                  }}
                >
                  <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-default">
                    {cover ? (
                      <img
                        src={cover.src}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Folder size={36} />
                    )}
                  </span>
                  <span className="truncate pt-1 text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-xs text-muted">
                    {members.length} 张图片
                  </span>
                </button>
                <Dropdown>
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label={`相册操作 ${item.name}`}
                    className={`${iconClass} absolute top-1 right-1 bg-background/90 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`}
                  >
                    <MoreHorizontal size={18} />
                  </Button>
                  <Dropdown.Popover className={menuClass}>
                    <MenuItems
                      label={`相册操作 ${item.name}`}
                      items={albumMenu}
                      onAction={(action) => {
                        if (action === 'open') navigate(`/albums/${item.id}`);
                        if (action === 'share')
                          navigate(`/shares/${item.id}?from=album`);
                        if (action === 'edit') setEditing(item);
                        if (action === 'delete') setDeleting(item);
                      }}
                    />
                  </Dropdown.Popover>
                </Dropdown>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Folder />}
          title={query ? '未找到相册' : '暂无相册'}
        />
      )}
      <Footer>
        <span className="mr-auto text-sm text-muted">
          {albums.length} 本相册
        </span>
      </Footer>
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
                context.target.focus({ preventScroll: true });
                setContext(null);
              }
            }}
          >
            <Button className="sr-only" aria-label="相册右键菜单来源" />
            <Dropdown.Popover triggerRef={anchor} className={menuClass}>
              <MenuItems
                label="相册右键操作"
                items={albumMenu}
                onAction={(action) => {
                  const item = context.album;
                  setContext(null);
                  if (action === 'open') navigate(`/albums/${item.id}`);
                  if (action === 'share')
                    navigate(`/shares/${item.id}?from=album`);
                  if (action === 'edit') setEditing(item);
                  if (action === 'delete') setDeleting(item);
                }}
              />
            </Dropdown.Popover>
          </Dropdown>
        </>
      ) : null}
      {creating ? (
        <NameEditor
          title="新建相册"
          onClose={() => setCreating(false)}
          onSave={(name) => {
            const id = crypto.randomUUID();
            setAlbums((current) => [...current, { id, name }]);
            setCreating(false);
            toast.success('相册已创建');
            navigate(`/albums/${id}`);
            return undefined;
          }}
        />
      ) : null}
      {editing ? (
        <NameEditor
          title="编辑相册"
          value={editing.name}
          onClose={() => setEditing(null)}
          onSave={(name) => {
            setAlbums((current) =>
              current.map((item) =>
                item.id === editing.id ? { ...item, name } : item,
              ),
            );
            setEditing(null);
            toast.success('相册已更新');
            return undefined;
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteAlbum album={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </div>
  );
}
const albumMenu = [
  { id: 'open', label: '打开相册', icon: <Folder size={17} /> },
  { id: 'edit', label: '编辑相册', icon: <Pencil size={17} /> },
  { id: 'share', label: '分享设置', icon: <Link2 size={17} /> },
  { id: 'delete', label: '删除相册', icon: <Trash2 size={17} />, danger: true },
];

export function TagsPage() {
  const { tags, photos, createTag } = useDataStore();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  return (
    <div className="grid gap-6">
      <Header title="标签" />
      <div className="flex min-w-0 items-center gap-3">
        <SearchInput label="搜索标签" value={query} onChange={setQuery} />
        <Button
          className={`${buttonClass} shrink-0`}
          onPress={() => setCreating(true)}
        >
          <Plus size={17} />
          新建标签
        </Button>
      </div>
      <div className="divide-y divide-border">
        {tags
          .filter((tag) => tag.includes(query))
          .map((tag) => (
            <div key={tag} className="flex min-h-16 items-center gap-3">
              <Tags size={18} />
              <span className="min-w-0 flex-1 truncate text-sm">{tag}</span>
              <span className="text-sm text-muted">
                {
                  photos.filter(
                    (photo) => !photo.trashed && photo.tags.includes(tag),
                  ).length
                }{' '}
                张图片
              </span>
            </div>
          ))}
      </div>
      {creating ? (
        <NameEditor
          title="新建标签"
          onClose={() => setCreating(false)}
          onSave={(name) => {
            const result = createTag(name);
            if (result.error) return result.error;
            setCreating(false);
            toast.success('标签已创建');
            return undefined;
          }}
        />
      ) : null}
    </div>
  );
}
export function SharesPage({
  id,
  attention = false,
}: {
  id?: string;
  attention?: boolean;
}) {
  const { albums, photos, shares, setShares } = useDataStore();
  const { navigate, footerTarget } = useApp();
  const album = albums.find((item) => item.id === id);
  if (album)
    return (
      <ShareEditor
        albumId={album.id}
        key={id}
        albumName={album.name}
        publicCount={
          photos.filter(
            (photo) =>
              !photo.trashed &&
              photo.visibility === 'public' &&
              photo.albumIds.includes(album.id),
          ).length
        }
        value={shares[album.id] ?? null}
        onSave={(draft) => {
          setShares((current) => ({ ...current, [album.id]: draft }));
          toast.success(shares[album.id] ? '分享设置已保存' : '分享已创建');
        }}
        onBack={() =>
          navigate(
            new URLSearchParams(window.location.search).get('from') === 'album'
              ? `/albums/${album.id}`
              : '/shares',
          )
        }
        footerTarget={footerTarget}
        failure={attention}
      />
    );
  return (
    <div className="grid gap-6">
      <Header title="分享管理" />
      <div className="divide-y divide-border">
        {albums.map((item) => (
          <div
            key={item.id}
            className="flex min-h-20 items-center justify-between gap-3"
          >
            <div className="grid min-w-0 gap-1">
              <span className="truncate text-sm font-medium">{item.name}</span>
              <span className="text-xs text-muted">
                {shares[item.id]
                  ? shares[item.id].enabled
                    ? '已启用'
                    : '已停用'
                  : '未创建'}
              </span>
            </div>
            <Button
              variant="outline"
              className={buttonClass}
              onPress={() => navigate(`/shares/${item.id}`)}
            >
              <Link2 size={17} />
              分享设置
            </Button>
          </div>
        ))}
      </div>
      {!albums.length ? <EmptyState icon={<Link2 />} title="暂无相册" /> : null}
    </div>
  );
}
