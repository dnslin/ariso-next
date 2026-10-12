import { useRef, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Dropdown } from '@heroui/react/dropdown';
import { Modal } from '@heroui/react/modal';
import { Tooltip } from '@heroui/react/tooltip';
import {
  ArrowLeft,
  ChevronDown,
  CloudUpload,
  Folder,
  ImageIcon,
  Images,
  Plus,
  X,
} from 'lucide-react';
import { LibrarySelect } from '../../../src/app/library/library-controls';
import { CollectionGallery } from './collection-gallery';
import { CollectionActions, type ContextPosition } from './collection-actions';
import { useCollections, type Album, type Photo } from './collection-state';
import { AlbumImagePicker } from './album-picker';
import { NameDialog } from './collections';
import {
  EmptyState,
  Footer,
  PageHeader,
  SearchInput,
  usePrototype,
} from './shared';

/* eslint-disable @next/next/no-img-element -- Standalone prototype image assets. */
export function LibraryPage({ album }: { album?: Album }) {
  const { navigate } = usePrototype();
  const { photos, openUpload, jobs } = useCollections();
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [picker, setPicker] = useState(false);
  const [context, setContext] = useState<ContextPosition | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const failure = new URLSearchParams(window.location.search).get('failure');
  const scoped = photos.filter(
    (item) => !album || item.albumIds.includes(album.id),
  );
  const filtered = scoped.filter(
    (item) =>
      item.name.includes(query.trim()) &&
      (visibility === 'all' || item.visibility === visibility),
  );
  const items = failure
    ? filtered.slice(0, failure === 'reprocess' ? 1 : 3)
    : filtered;
  const chosen = photos.filter((item) => selected.includes(item.id));
  const activeJobs = jobs.filter(
    (job) => job.phase !== 'done' && (!album || job.albumId === album.id),
  );
  function openContext(
    item: Photo,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) {
    const target =
      event.currentTarget.querySelector<HTMLButtonElement>('button') ??
      event.currentTarget;
    const bounds = target.getBoundingClientRect();
    if (!selected.includes(item.id)) setSelected([item.id]);
    setContext({
      x: 'clientX' in event ? event.clientX : bounds.left + 16,
      y: 'clientY' in event ? event.clientY : bounds.top + 16,
      target,
    });
  }
  return (
    <div className="prototype-page">
      {album ? (
        <Button
          variant="ghost"
          className="prototype-button -ml-3 w-fit"
          onPress={() => navigate('/albums')}
        >
          <ArrowLeft size={18} aria-hidden />
          返回
        </Button>
      ) : null}
      <PageHeader title={album?.name ?? '图库'}>
        {album ? (
          <Dropdown>
            <Button
              ref={addButton}
              className="prototype-button"
              aria-label="添加图片"
            >
              <Plus size={18} aria-hidden />
              添加图片
              <ChevronDown size={16} aria-hidden />
            </Button>
            <Dropdown.Popover className="min-w-48 rounded-xl border border-border bg-surface p-1.5">
              <Dropdown.Menu
                aria-label="添加图片方式"
                onAction={(key) => {
                  if (key === 'upload') openUpload(album.id, addButton.current);
                  else setPicker(true);
                }}
              >
                <Dropdown.Item
                  id="upload"
                  textValue="上传新图片"
                  className="min-h-11 gap-3 rounded-lg px-3 text-sm"
                >
                  <CloudUpload size={17} aria-hidden />
                  上传新图片
                </Dropdown.Item>
                <Dropdown.Item
                  id="library"
                  textValue="从图库选择"
                  className="min-h-11 gap-3 rounded-lg px-3 text-sm"
                >
                  <Images size={17} aria-hidden />
                  从图库选择
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        ) : (
          <Button
            ref={addButton}
            className="prototype-button"
            onPress={() => openUpload('', addButton.current)}
          >
            <CloudUpload size={18} aria-hidden />
            上传
          </Button>
        )}
      </PageHeader>
      {album ? (
        <p className="text-sm text-muted">{scoped.length} 张图片</p>
      ) : null}
      {scoped.length || query || visibility !== 'all' ? (
        <div
          className="flex min-w-0 flex-wrap items-center gap-3"
          data-testid="collection-toolbar"
        >
          <div className="w-full min-w-0 sm:w-auto sm:min-w-60 sm:flex-1 sm:max-w-96">
            <SearchInput
              label="搜索图片"
              value={query}
              onChange={(value) => {
                setQuery(value);
                setSelected([]);
                setContext(null);
              }}
              placeholder="搜索图片名称"
            />
          </div>
          <LibrarySelect
            label="筛选可见性"
            value={visibility}
            onChange={(value) => {
              setVisibility(value);
              setSelected([]);
              setContext(null);
            }}
            options={[
              { id: 'all', label: '全部可见性' },
              { id: 'public', label: '公开' },
              { id: 'private', label: '私有' },
            ]}
            className="w-30 [&_.select__trigger]:h-12"
          />
          {chosen.length ? (
            <div
              className="ml-auto flex items-center gap-1 min-[360px]:gap-2"
              data-testid="collection-selection"
            >
              <span
                className="sr-only whitespace-nowrap text-sm text-muted min-[360px]:not-sr-only"
                role="status"
              >
                已选 {chosen.length} 张
              </span>
              <CollectionActions
                selected={chosen}
                albumId={album?.id}
                context={context}
                onContextClose={() => setContext(null)}
                onOpen={setPhoto}
                onRemoved={() => setSelected([])}
              />
              <Tooltip>
                <Button
                  isIconOnly
                  variant="ghost"
                  className="prototype-icon-button"
                  aria-label="取消选择"
                  onPress={() => {
                    setSelected([]);
                    setContext(null);
                  }}
                >
                  <X size={17} aria-hidden />
                </Button>
                <Tooltip.Content>取消选择</Tooltip.Content>
              </Tooltip>
            </div>
          ) : null}
        </div>
      ) : null}
      {activeJobs.length ? (
        <button
          type="button"
          className="flex min-h-11 items-center gap-2 border-b border-border py-2 text-left text-sm"
          onClick={(event) => openUpload(album?.id, event.currentTarget)}
        >
          <CloudUpload size={16} aria-hidden />
          {activeJobs.some((job) => job.phase === 'failed')
            ? '上传失败，查看并重试'
            : `${activeJobs.reduce((count, job) => count + job.files.length, 0)} 张图片正在上传`}
        </button>
      ) : null}
      {failure ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-sm">
          <span className="text-danger">
            {failure === 'reprocess' ? '重新处理失败' : '初次处理失败'} ·{' '}
            {items.length} 张
          </span>
          <Button
            variant="ghost"
            className="prototype-button"
            onPress={() => navigate('/library')}
          >
            <X size={16} aria-hidden />
            清除筛选
          </Button>
        </div>
      ) : null}
      {items.length ? (
        <CollectionGallery
          items={items}
          selected={selected}
          onSelect={setSelected}
          onOpen={setPhoto}
          onContext={openContext}
        />
      ) : (
        <EmptyState
          icon={<ImageIcon />}
          title={query || visibility !== 'all' ? '未找到图片' : '暂无图片'}
        />
      )}
      <Footer>
        <span className="text-sm text-muted">共 {scoped.length} 张图片</span>
      </Footer>
      {picker && album ? (
        <AlbumImagePicker
          album={album}
          onClose={() => {
            setPicker(false);
            requestAnimationFrame(() => addButton.current?.focus());
          }}
        />
      ) : null}
      {photo ? (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) setPhoto(null);
          }}
        >
          <Modal.Container size="lg">
            <Modal.Dialog className="gap-4 rounded-xl border border-border bg-surface p-5">
              <Modal.Header className="flex flex-row items-center justify-between gap-3 text-left">
                <Modal.Heading className="min-w-0 break-all text-lg font-medium">
                  {photo.name}
                </Modal.Heading>
                <CloseButton
                  aria-label="关闭图片"
                  className="prototype-icon-button"
                  onPress={() => setPhoto(null)}
                />
              </Modal.Header>
              <Modal.Body className="m-0 grid gap-4 p-0">
                <img
                  src={photo.src}
                  alt={photo.name}
                  className="max-h-[60dvh] w-full rounded-lg object-contain"
                />
                <span className="text-sm text-muted">
                  {photo.size} ·{' '}
                  {photo.visibility === 'public' ? '公开' : '私有'}
                </span>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </div>
  );
}

export function AlbumsPage() {
  const { notify, navigate } = usePrototype();
  const { albums, setAlbums, photos } = useCollections();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const albumId = decodeURIComponent(
    window.location.pathname.split('/')[2] ?? '',
  );
  const album = albums.find((item) => item.id === albumId);
  if (album) return <LibraryPage key={album.id} album={album} />;
  return (
    <div className="prototype-page">
      <PageHeader title="相册" />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-96">
          <SearchInput
            label="搜索相册"
            value={query}
            onChange={setQuery}
            placeholder="搜索相册"
          />
        </div>
        <Button
          className="prototype-button shrink-0"
          onPress={() => setCreating(true)}
        >
          <Plus size={18} aria-hidden />
          新建相册
        </Button>
      </div>
      {albums.filter((item) => item.name.includes(query.trim())).length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
          {albums
            .filter((item) => item.name.includes(query.trim()))
            .map((item) => {
              const members = photos.filter((photo) =>
                photo.albumIds.includes(item.id),
              );
              return (
                <button
                  type="button"
                  key={item.id}
                  className="grid min-w-0 gap-2 rounded-lg text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => navigate(`/albums/${item.id}`)}
                >
                  <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-surface">
                    {members[0] ? (
                      <img
                        src={members[0].src}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Folder size={36} aria-hidden />
                    )}
                  </span>
                  <span className="break-words text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-xs text-muted">
                    {members.length} 张图片
                  </span>
                </button>
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
        <span className="text-sm text-muted">共 {albums.length} 本相册</span>
      </Footer>
      {creating ? (
        <NameDialog
          title="新建相册"
          label="相册名称"
          onClose={() => setCreating(false)}
          onSave={(name) => {
            const id = crypto.randomUUID();
            setAlbums((current) => [...current, { id, name }]);
            setCreating(false);
            notify('相册已创建');
            navigate(`/albums/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}
