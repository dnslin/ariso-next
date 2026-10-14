'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { Alert } from '@heroui/react/alert';
import { Dropdown } from '@heroui/react/dropdown';
import { Toolbar } from '@heroui/react/toolbar';
import { Tooltip } from '@heroui/react/tooltip';
import { ButtonGroup } from '@heroui/react/button-group';
import { toast } from '@heroui/react/toast';
import {
  ArrowLeft,
  ChevronDown,
  Folder,
  Images,
  Plus,
  Search,
  CloudUpload,
  Ellipsis,
  ImageIcon,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react';
import { LibraryScreen } from '../library/library-screen';
import { OwnerShell } from '../../components/shell/owner-shell';
import { useResetUpload } from '../../components/upload/provider';
import { albumUploadHref } from '../../components/upload/context';
import {
  ActionIconButton,
  actionGroupClass,
} from '../../components/library/action-button';
import { AlbumDialog, type AlbumAction } from './dialog';
import { AlbumCoverPicker } from './cover-picker';
import { AlbumCoverSummary } from './cover-preview';
import { AnimatedAlbumCard } from './motion';
import { ComponentEntrance } from '../../components/component-entrance';
import { AlbumImagePicker } from './image-picker';
import {
  albumRequest,
  AlbumRequestError,
  albumUrl,
  type Album,
  type AlbumPage,
} from './api';
import {
  collectionDetailHref,
  readCollectionReturn,
  shareSettingsHref,
} from './collection-navigation';
import {
  useCollectionQuery,
  useCollectionReturn,
} from './use-collection-navigation';

export function AlbumsScreen(props: {
  name: string;
  logoUrl?: string | null;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  albumId?: string;
  timeZone?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const resetUpload = useResetUpload();
  const [client] = useState(() => new QueryClient());
  const query = useCollectionQuery('/albums');
  const { q, page, pageSize } = query;
  const currentHref = props.albumId
    ? `/albums/${encodeURIComponent(props.albumId)}${params.size ? `?${params}` : ''}`
    : query.href;
  const backHref = readCollectionReturn(
    params.get('returnTo'),
    props.albumId ?? '',
    '/albums',
  );
  const [galleryReady, setGalleryReady] = useState(false);
  const [action, setAction] = useState<AlbumAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const addTrigger = useRef<HTMLButtonElement>(null);
  function closePicker() {
    setPickerOpen(false);
    requestAnimationFrame(() =>
      addTrigger.current?.focus({ preventScroll: true }),
    );
  }
  const coverTrigger = useRef<HTMLButtonElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const coverScroll = useRef(0);
  function openCover() {
    coverScroll.current = coverTrigger.current?.closest('main')?.scrollTop ?? 0;
    setCoverOpen(true);
  }
  function closeCover() {
    setCoverOpen(false);
    void detail.refetch();
    requestAnimationFrame(() => {
      coverTrigger.current
        ?.closest('main')
        ?.scrollTo({ top: coverScroll.current });
      coverTrigger.current?.focus({ preventScroll: true });
    });
  }
  const opener = useRef<HTMLElement | null>(null);
  function openAction(next: AlbumAction, element?: HTMLElement | null) {
    opener.current = element ?? (document.activeElement as HTMLElement | null);
    if (!action) setAction(next);
    setDialogOpen(true);
  }
  function closeAction(preserve = false) {
    setDialogOpen(false);
    if (!preserve) setAction(null);
    requestAnimationFrame(() => opener.current?.focus());
  }
  const list = useQuery(
    {
      queryKey: ['albums', q, page, pageSize],
      queryFn: ({ signal }) =>
        albumRequest<AlbumPage>(
          `/api/albums?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`,
          { signal },
        ),
      enabled: !props.albumId && !query.error,
      placeholderData: keepPreviousData,
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  const detail = useQuery(
    {
      queryKey: ['album', props.albumId],
      queryFn: ({ signal }) =>
        albumRequest<{ album: Album }>(albumUrl(props.albumId!), { signal }),
      enabled: !!props.albumId,
      refetchOnWindowFocus: false,
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  useEffect(() => {
    const refresh = (event: Event) => {
      const { albumIds } = (event as CustomEvent<{ albumIds: string[] }>)
        .detail;
      if (!props.albumId && albumIds.length)
        void client.invalidateQueries({ queryKey: ['albums'] });
      else if (props.albumId && albumIds.includes(props.albumId))
        void client.invalidateQueries({ queryKey: ['album', props.albumId] });
    };
    window.addEventListener('ariso:upload-albums-changed', refresh);
    return () =>
      window.removeEventListener('ariso:upload-albums-changed', refresh);
  }, [client, props.albumId]);
  const error = props.albumId ? detail.error : (query.error ?? list.error);
  const expired = error instanceof AlbumRequestError && error.status === 401;
  useEffect(() => () => client.clear(), [client]);
  function expire() {
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }
  useEffect(() => {
    if (!expired) return;
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }, [expired, resetUpload, client]);
  const data = !list.isError && !query.error ? list.data : undefined;
  const missing = error instanceof AlbumRequestError && error.status === 404;
  const album = !expired && !missing ? detail.data?.album : undefined;
  const rememberReturn = useCollectionReturn(
    currentHref,
    props.albumId
      ? Boolean(album) && galleryReady
      : !list.isPending && !list.isPlaceholderData && !error,
    !props.albumId,
    query.replacedHref,
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const albumDialog =
    action && !expired && !missing ? (
      <AlbumDialog
        action={action}
        isOpen={dialogOpen}
        onClose={closeAction}
        onExpire={expire}
        onCheckList={async () => {
          const result = await list.refetch();
          if (result.error) throw result.error;
        }}
        onComplete={(saved) => {
          if (action?.kind === 'edit')
            toast('相册已保存', { variant: 'default' });
          else if (action?.kind === 'delete')
            toast('相册已删除', {
              description: '图片仍在图库。',
              variant: 'default',
            });
          closeAction();
          if (saved) {
            client.setQueryData(['album', saved.id], { album: saved });
            if (action?.kind === 'create')
              router.push(collectionDetailHref(saved.id, currentHref));
          } else if (props.albumId) router.push(backHref);
          void client.invalidateQueries({ queryKey: ['albums'] });
        }}
      />
    ) : null;
  const readError = error ? (
    <Alert status="danger" role="alert" data-testid="albums-error">
      <Alert.Content>
        <Alert.Title>
          {missing ? '相册已不存在' : album ? '相册刷新失败' : '相册读取失败'}
        </Alert.Title>
        <Alert.Description>{error.message}</Alert.Description>
        <Button
          variant="outline"
          className="mt-3 min-h-11 font-normal"
          isDisabled={props.albumId ? detail.isFetching : list.isFetching}
          onPress={() => {
            if (!props.albumId && query.error)
              query.change({ q: '', page: 1, pageSize: 40 });
            else void (props.albumId ? detail.refetch() : list.refetch());
          }}
        >
          {!props.albumId && query.error ? '重置查询' : '重试加载'}
        </Button>
      </Alert.Content>
    </Alert>
  ) : null;
  if (props.albumId && album)
    return (
      <AlbumCoverPicker
        album={album}
        isOpen={coverOpen}
        onCancel={closeCover}
        onExpire={expire}
        onComplete={(saved) => {
          client.setQueryData(['album', saved.id], { album: saved });
          void client.invalidateQueries({ queryKey: ['albums'] });
          closeCover();
        }}
        renderWorkspace={(content, footer) => (
          <LibraryScreen
            {...props}
            timeZone={props.timeZone!}
            refreshKey={refreshKey}
            workspace={coverOpen ? { content, footer } : undefined}
            onRefresh={() => {
              void detail.refetch();
            }}
            onListReady={() => setGalleryReady(true)}
            afterToolbar={
              <>
                {readError}
                <AlbumCoverSummary
                  key={JSON.stringify(album.cover)}
                  album={album}
                  onSetCover={openCover}
                  onRefresh={async () => {
                    const result = await detail.refetch();
                    if (result.error) throw result.error;
                  }}
                />
              </>
            }
            onImageRemoved={() => {
              void client.invalidateQueries({
                queryKey: ['album', props.albumId],
              });
            }}
            header={
              <>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <h1
                    id="library-title"
                    data-collection-return-fallback
                    tabIndex={-1}
                    className="min-w-0 max-w-full text-[26px] font-medium leading-normal [overflow-wrap:anywhere] md:text-[30px]"
                  >
                    {album.name}
                  </h1>
                  <Link
                    href={backHref}
                    aria-label="返回相册列表"
                    className="min-h-11 shrink-0 gap-2 rounded-lg px-3 text-sm font-normal text-foreground no-underline"
                  >
                    <ArrowLeft size={18} aria-hidden />
                    返回
                  </Link>
                </div>
                <p className="text-sm text-muted">
                  {album.imageCount} 张图片 · {album.publicImageCount} 张公开
                </p>
                {album.description ? (
                  <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {album.description}
                  </p>
                ) : null}
              </>
            }
            toolbarActions={
              <Toolbar
                aria-label="相册操作"
                className="flex min-w-0 flex-wrap items-center justify-end gap-3"
              >
                <ButtonGroup className={actionGroupClass}>
                  <ActionIconButton
                    label="编辑相册"
                    onPress={() => openAction({ kind: 'edit', album })}
                  >
                    <Pencil size={18} aria-hidden />
                  </ActionIconButton>
                  <ActionIconButton
                    label="设置封面"
                    ref={coverTrigger}
                    onPress={openCover}
                  >
                    <ImageIcon size={18} aria-hidden />
                  </ActionIconButton>
                  <ActionIconButton
                    label="分享设置"
                    data-collection-return-focus={`album-share-${album.id}`}
                    onPress={(event) => {
                      rememberReturn(event.target as HTMLElement);
                      router.push(shareSettingsHref(album.id, currentHref));
                    }}
                  >
                    <Share2 size={18} aria-hidden />
                  </ActionIconButton>
                  <Dropdown>
                    <Tooltip>
                      <Button
                        ref={moreTrigger}
                        aria-label="更多相册操作"
                        isIconOnly
                        variant="tertiary"
                        className="size-11 min-w-11 rounded-lg"
                      >
                        <Ellipsis size={18} aria-hidden />
                      </Button>
                      <Tooltip.Content>更多相册操作</Tooltip.Content>
                    </Tooltip>
                    <Dropdown.Popover className="rounded-xl border border-border bg-surface p-1">
                      <Dropdown.Menu
                        aria-label="更多相册操作"
                        onAction={() =>
                          openAction(
                            { kind: 'delete', album },
                            moreTrigger.current,
                          )
                        }
                      >
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
                </ButtonGroup>
                <Dropdown>
                  <Button
                    ref={addTrigger}
                    className="h-12 shrink-0 gap-2 rounded-lg font-normal"
                  >
                    <Plus size={17} aria-hidden />
                    添加图片
                    <ChevronDown size={16} aria-hidden />
                  </Button>
                  <Dropdown.Popover className="min-w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
                    <Dropdown.Menu
                      aria-label="添加相册图片"
                      onAction={(key) => {
                        if (key === 'upload')
                          router.push(
                            albumUploadHref(
                              album.id,
                              window.location.pathname + window.location.search,
                            ),
                          );
                        else setPickerOpen(true);
                      }}
                    >
                      <Dropdown.Item
                        id="upload"
                        textValue="上传新图片"
                        className="min-h-11 gap-2 rounded-md"
                      >
                        <CloudUpload size={17} aria-hidden />
                        上传新图片
                      </Dropdown.Item>
                      <Dropdown.Item
                        id="library"
                        textValue="从图库选择"
                        className="min-h-11 gap-2 rounded-md"
                      >
                        <Images size={17} aria-hidden />
                        从图库选择
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </Toolbar>
            }
          >
            {albumDialog}
            <AlbumImagePicker
              album={album}
              isOpen={pickerOpen}
              onClose={closePicker}
              onExpire={expire}
              onChanged={async () => {
                setRefreshKey((value) => value + 1);
                void client.invalidateQueries({ queryKey: ['albums'] });
                const result = await detail.refetch();
                if (result.error) throw result.error;
              }}
            />
          </LibraryScreen>
        )}
      />
    );
  return (
    <OwnerShell
      {...props}
      footer={
        !props.albumId ? (
          <div className="grid w-full gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <p
              data-testid="albums-count"
              role="status"
              className="text-[13px] text-muted"
            >
              {data ? `共 ${data.total} 本相册` : '数量待确认'}
            </p>
            <div className="flex items-center gap-2">
              <Select
                aria-label="每页相册数"
                value={String(pageSize)}
                onChange={(value) => {
                  if (value) {
                    query.change({ pageSize: Number(value) });
                  }
                }}
                className="w-28 shrink-0"
              >
                <Select.Trigger className="h-11 rounded-lg border border-border bg-background font-normal">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {[20, 40, 80].map((size) => (
                      <ListBox.Item
                        key={size}
                        id={String(size)}
                        textValue={`${size} 本 / 页`}
                        className="min-h-11"
                      >
                        {size} 本 / 页<ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Pagination aria-label="相册分页" className="min-w-0 flex-1">
                <Pagination.Content className="w-full gap-2">
                  <Pagination.Item className="flex-1">
                    <Pagination.Previous
                      className="h-11 w-full min-w-0 rounded-lg border border-border px-3 font-normal"
                      isDisabled={page <= 1 || list.isFetching}
                      onPress={() => query.change({ page: page - 1 })}
                    >
                      上一页
                    </Pagination.Previous>
                  </Pagination.Item>
                  <Pagination.Item>
                    <Pagination.Summary className="text-xs">
                      {page}/{pages}
                    </Pagination.Summary>
                  </Pagination.Item>
                  <Pagination.Item className="flex-1">
                    <Pagination.Next
                      className="h-11 w-full min-w-0 rounded-lg border border-border px-3 font-normal"
                      isDisabled={!data || page >= pages || list.isFetching}
                      onPress={() => query.change({ page: page + 1 })}
                    >
                      下一页
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
            </div>
          </div>
        ) : undefined
      }
    >
      <section
        className="grid min-w-0 grid-cols-1 gap-4"
        aria-busy={props.albumId ? detail.isPending : list.isPending}
        data-testid="albums-screen"
      >
        {props.albumId ? (
          <div className="flex items-center justify-between gap-3">
            <ComponentEntrance
              as="h1"
              className="text-[26px] font-medium leading-normal md:text-[30px]"
            >
              相册
            </ComponentEntrance>
            <Link
              href={backHref}
              aria-label="返回相册列表"
              className="min-h-11 shrink-0 gap-2 rounded-lg px-3 text-sm font-normal text-foreground no-underline"
            >
              <ArrowLeft size={18} aria-hidden />
              返回
            </Link>
          </div>
        ) : (
          <>
            <ComponentEntrance
              as="h1"
              className="text-[26px] font-medium leading-normal md:text-[30px]"
            >
              相册
            </ComponentEntrance>
            <ComponentEntrance
              delay={0.055}
              className="flex w-full gap-2 md:max-w-120 md:gap-4"
            >
              <TextField
                aria-label="搜索相册"
                value={q}
                onChange={(value) => {
                  query.change({ q: value });
                }}
                className="min-w-0 flex-1"
              >
                <InputGroup className="h-11 w-full min-w-0 rounded-lg border border-border bg-background shadow-none">
                  <InputGroup.Prefix className="border-0 pr-2 text-muted">
                    <Search size={16} aria-hidden />
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    data-collection-return-fallback
                    placeholder="搜索相册…"
                    className="h-11 min-w-0 py-0 text-base md:text-sm"
                  />
                </InputGroup>
              </TextField>
              <Button
                className="h-11 w-28.5 shrink-0 gap-1 rounded-lg text-sm font-normal md:w-36"
                onPress={() => openAction({ kind: 'create' })}
              >
                <Plus size={16} aria-hidden />
                新建相册
              </Button>
            </ComponentEntrance>
            <div
              data-testid="albums-list"
              aria-busy={list.isFetching}
              className="relative grid grid-cols-1 gap-4 empty:hidden md:grid-cols-[repeat(auto-fill,minmax(300px,365px))]"
            >
              {(data?.items ?? []).map((item, index) => (
                <AnimatedAlbumCard
                  key={item.id}
                  index={index}
                  album={item}
                  href={collectionDetailHref(item.id, currentHref)}
                  onNavigate={rememberReturn}
                  onOpen={(element) => {
                    rememberReturn(element);
                    router.push(collectionDetailHref(item.id, currentHref));
                  }}
                  onEdit={(element) =>
                    openAction({ kind: 'edit', album: item }, element)
                  }
                  onShare={(element) => {
                    rememberReturn(element);
                    router.push(shareSettingsHref(item.id, currentHref));
                  }}
                  onDelete={(element) =>
                    openAction({ kind: 'delete', album: item }, element)
                  }
                />
              ))}
              {data?.items.length === 0 ? (
                <ComponentEntrance
                  key="empty"
                  data-testid="albums-empty"
                  className="col-span-full grid min-h-80 content-center justify-items-center gap-4 text-center"
                >
                  <Folder size={36} aria-hidden />
                  <h2 className="text-xl">
                    {q
                      ? '未找到相册'
                      : data.total
                        ? '本页已无相册'
                        : '暂无相册'}
                  </h2>
                  {page > 1 ? (
                    <Button
                      className="h-12 rounded-lg font-normal"
                      onPress={() => query.change({ page: 1 })}
                    >
                      返回第一页
                    </Button>
                  ) : q ? (
                    <Button
                      className="h-12 rounded-lg font-normal"
                      variant="outline"
                      onPress={() => query.change({ q: '' })}
                    >
                      清除搜索
                    </Button>
                  ) : null}
                </ComponentEntrance>
              ) : null}
            </div>
          </>
        )}
        {readError}
      </section>
      {albumDialog}
    </OwnerShell>
  );
}
