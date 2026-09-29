'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { Spinner } from '@heroui/react/spinner';
import { Alert } from '@heroui/react/alert';
import { ArrowLeft, Folder, Plus, Search } from 'lucide-react';
import { OwnerShell } from '../../components/shell/owner-shell';
import { useResetUpload } from '../../components/upload/provider';
import { AlbumDialog, type AlbumAction } from './dialog';
import {
  albumRequest,
  AlbumRequestError,
  albumUrl,
  type Album,
  type AlbumPage,
} from './api';

export function AlbumsScreen(props: {
  name: string;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  albumId?: string;
}) {
  const router = useRouter();
  const resetUpload = useResetUpload();
  const [client] = useState(() => new QueryClient());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);
  const [action, setAction] = useState<AlbumAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  function openAction(next: AlbumAction) {
    opener.current = document.activeElement as HTMLElement | null;
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
      enabled: !props.albumId,
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
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  const error = props.albumId ? detail.error : list.error;
  const expired = error instanceof AlbumRequestError && error.status === 401;
  useEffect(() => () => client.clear(), [client]);
  function expire() {
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname)}`,
    );
  }
  useEffect(() => {
    if (!expired) return;
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname)}`,
    );
  }, [expired, resetUpload, client]);
  const data = !list.isError ? list.data : undefined;
  const album = !detail.isError ? detail.data?.album : undefined;
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
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
                    setPageSize(Number(value));
                    setPage(1);
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
                      onPress={() => setPage(page - 1)}
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
                      onPress={() => setPage(page + 1)}
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
      <section className="grid min-w-0 grid-cols-1 gap-4">
        {props.albumId ? (
          <>
            <Link
              href="/albums"
              className="min-h-11 w-fit gap-2 px-3 text-sm font-normal"
            >
              <ArrowLeft size={16} />
              返回相册列表
            </Link>
            {album ? (
              <>
                <h1 className="text-[26px] font-medium leading-normal break-words md:text-[30px]">
                  {album.name}
                </h1>
                <p className="text-sm text-muted">
                  {album.imageCount} 张图片 · 相册 #{album.id.slice(0, 8)}
                </p>
                {album.description ? (
                  <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {album.description}
                  </p>
                ) : null}
                <div className="grid w-full grid-cols-3 gap-2.5 md:max-w-130">
                  <Button
                    variant="outline"
                    className="h-12 w-full min-w-0 rounded-lg px-2 font-normal"
                    onPress={() => openAction({ kind: 'edit', album })}
                  >
                    编辑相册
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 w-full min-w-0 rounded-lg px-2 font-normal"
                    isDisabled
                    aria-label="设置封面，尚未开放"
                  >
                    设置封面
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 w-full min-w-0 rounded-lg px-2 font-normal"
                    onPress={() => openAction({ kind: 'menu', album })}
                  >
                    更多
                  </Button>
                </div>
                <div className="grid min-h-80 content-center justify-items-center gap-4 text-center md:min-h-120">
                  <div className="grid size-18 place-items-center rounded-3xl bg-default md:size-22">
                    <Folder size={36} aria-hidden />
                  </div>
                  <h2 className="text-[22px] font-medium md:text-[26px]">
                    相册内容尚未开放
                  </h2>
                  <p className="max-w-105 text-sm text-muted">
                    现在可以管理相册名称与描述。图片内容、搜索与封面将在后续开放。
                  </p>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-medium leading-normal md:text-[30px]">
              相册
            </h1>
            <p className="text-sm text-muted">
              用相册整理图片，一张图片可以出现在多个相册。
            </p>
            <div className="flex w-full gap-2 md:max-w-120 md:gap-4">
              <TextField
                aria-label="搜索相册"
                value={q}
                onChange={(value) => {
                  setQ(value);
                  setPage(1);
                }}
                className="min-w-0 flex-1"
              >
                <InputGroup className="h-11 w-full min-w-0 rounded-lg border border-border bg-background shadow-none">
                  <InputGroup.Prefix className="border-0 pr-2 text-muted">
                    <Search size={16} aria-hidden />
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    placeholder="搜索相册…"
                    className="h-full min-w-0 py-0 text-base md:text-sm"
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
            </div>
            {data?.items.length ? (
              <div
                data-testid="albums-list"
                className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,365px))]"
              >
                {data.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/albums/${item.id}`}
                    data-testid={`album-${item.id}`}
                    className="flex w-full min-w-0 flex-col items-stretch gap-3 rounded-[20px] border border-border bg-surface p-4 text-foreground no-underline"
                  >
                    <div
                      className="aspect-[333/184] w-full rounded-xl bg-default"
                      aria-hidden
                    />
                    <span className="text-base font-medium [overflow-wrap:anywhere]">
                      {item.name}
                    </span>
                    <span className="text-xs font-normal text-muted">
                      {item.imageCount} 张图片 · #{item.id.slice(0, 8)} ·
                      封面尚未开放
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            {data?.items.length === 0 ? (
              <div
                data-testid="albums-empty"
                className="grid min-h-80 content-center justify-items-center gap-4 text-center"
              >
                <Folder size={36} aria-hidden />
                <h2 className="text-xl">
                  {q
                    ? '没有找到相册'
                    : data.total
                      ? '本页已无相册'
                      : '还没有相册'}
                </h2>
                <p className="text-sm text-muted">
                  {q ? '请尝试其他名称。' : '创建一本相册，开始整理图片。'}
                </p>
                {page > 1 ? (
                  <Button
                    className="h-12 rounded-lg font-normal"
                    onPress={() => setPage(1)}
                  >
                    返回第一页
                  </Button>
                ) : !q ? (
                  <Button
                    className="h-12 rounded-lg font-normal"
                    onPress={() => openAction({ kind: 'create' })}
                  >
                    创建第一本相册
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        {(props.albumId ? detail.isPending : list.isPending) ? (
          <p
            role="status"
            data-testid="albums-loading"
            className="flex items-center gap-2 py-8"
          >
            <Spinner size="sm" />
            正在读取相册…
          </p>
        ) : null}
        {error ? (
          <Alert status="danger" data-testid="albums-error">
            <Alert.Content>
              <Alert.Title>
                {error instanceof AlbumRequestError && error.status === 404
                  ? '相册已不存在'
                  : '相册读取失败'}
              </Alert.Title>
              <Alert.Description>{error.message}</Alert.Description>
              <Button
                variant="outline"
                className="mt-3 min-h-11 font-normal"
                onPress={() => {
                  void (props.albumId ? detail.refetch() : list.refetch());
                }}
              >
                重试加载
              </Button>
            </Alert.Content>
          </Alert>
        ) : null}
      </section>
      {action ? (
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
            closeAction();
            if (saved) {
              client.setQueryData(['album', saved.id], { album: saved });
              if (!props.albumId) router.push(`/albums/${saved.id}`);
            } else router.push('/albums');
            void client.invalidateQueries({ queryKey: ['albums'] });
          }}
        />
      ) : null}
    </OwnerShell>
  );
}
