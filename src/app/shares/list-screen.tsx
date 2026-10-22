'use client';

import { ComponentEntrance } from '../../components/component-entrance';

import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { Alert } from '@heroui/react/alert';
import { Link as LinkIcon, Search } from 'lucide-react';
import { OwnerShell } from '../../components/shell/owner-shell';
import { StorageTip } from '../../components/storage/storage-tip';
import { useResetUpload } from '../../components/upload/provider';
import { shareRequest, ShareRequestError } from './api';
import { SharesList, type SharePage } from './list';
import { ImageSharesList, type ImageSharePage } from './image-list';
import { useShareListQuery } from './use-list-query';
import { useCollectionReturn } from '../albums/use-collection-navigation';

export function SharesScreen(props: {
  name: string;
  logoUrl?: string | null;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  timeZone: string;
}) {
  const resetUpload = useResetUpload();
  const [client] = useState(() => new QueryClient());
  const query = useShareListQuery();
  const { q, page, pageSize } = query;
  const expire = useCallback(() => {
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }, [resetUpload, client]);
  const albumList = useQuery(
    {
      queryKey: ['shares', q, page, pageSize],
      queryFn: ({ signal }) =>
        shareRequest<SharePage>(
          `/api/shares?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`,
          { signal },
        ),
      placeholderData: keepPreviousData,
      enabled: !query.error && query.kind === 'album',
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  const imageList = useQuery(
    {
      queryKey: ['image-shares', q, page, pageSize],
      queryFn: ({ signal }) =>
        shareRequest<ImageSharePage>(
          `/api/shares/images?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`,
          { signal },
        ),
      placeholderData: keepPreviousData,
      enabled: !query.error && query.kind === 'image',
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  const list = query.kind === 'image' ? imageList : albumList;
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (list.error instanceof ShareRequestError && list.error.status === 401)
      expire();
  }, [list.error, expire]);
  const error = query.error ?? list.error;
  const data = !error ? list.data : undefined;
  const rememberReturn = useCollectionReturn(
    query.href,
    !list.isPending && !list.isPlaceholderData && !error,
    true,
    query.replacedHref,
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  return (
    <OwnerShell
      {...props}
      onSessionExpire={expire}
      footer={
        error ? (
          <Button
            className="h-12 w-full rounded-lg font-normal md:w-50"
            isDisabled={list.isFetching}
            onPress={() => {
              if (query.error) query.change({ q: '', page: 1, pageSize: 40 });
              else void list.refetch();
            }}
          >
            {query.error ? '重置查询' : '重新加载'}
          </Button>
        ) : (
          <div className="grid w-full gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <p
              data-testid="shares-count"
              role="status"
              className="text-[13px] text-muted"
            >
              {data ? `共 ${data.total} 项分享` : '数量待确认'}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <Select
                aria-label="每页分享数"
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
                        textValue={`${size} 项 / 页`}
                        className="min-h-11"
                      >
                        {size} 项 / 页<ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Pagination aria-label="分享分页" className="min-w-0 flex-1">
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
        )
      }
    >
      <section
        data-testid="shares-screen"
        className="grid min-w-0 gap-4"
        aria-busy={list.isPending && !query.error}
      >
        <ComponentEntrance as="header" className="flex items-center gap-2">
          <h1 className="text-[28px] font-medium leading-normal md:text-[30px]">
            分享
          </h1>
          <StorageTip label="分享">
            相册链接只展示公开图片。单张私有图片使用独立的有期限查看页。 时间按{' '}
            {props.timeZone} 显示。
          </StorageTip>
        </ComponentEntrance>
        <ComponentEntrance
          delay={0.055}
          className="grid w-full min-w-0 gap-3 sm:grid-cols-[12rem_minmax(0,30rem)]"
        >
          <Select
            aria-label="分享类型"
            value={query.kind}
            onChange={(value) => {
              if (value)
                query.change({ kind: value as 'album' | 'image', q: '' });
            }}
            className="w-full"
          >
            <Select.Trigger className="h-11 rounded-lg border border-border bg-background font-normal">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item
                  id="album"
                  textValue="相册分享"
                  className="min-h-11"
                >
                  相册分享
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item
                  id="image"
                  textValue="私有图片分享"
                  className="min-h-11"
                >
                  私有图片分享
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
          <TextField
            aria-label={
              query.kind === 'image' ? '搜索分享图片' : '搜索分享相册'
            }
            value={q}
            onChange={(value) => {
              query.change({ q: value });
            }}
            className="w-full min-w-0 md:max-w-120"
          >
            <InputGroup className="h-11 w-full min-w-0 rounded-lg border border-border bg-background shadow-none">
              <InputGroup.Prefix className="border-0 pr-2 text-muted">
                <Search size={16} aria-hidden />
              </InputGroup.Prefix>
              <InputGroup.Input
                data-collection-return-fallback
                placeholder={
                  query.kind === 'image' ? '搜索分享图片…' : '搜索分享相册…'
                }
                className="h-11 min-w-0 py-0 text-base md:text-sm"
              />
            </InputGroup>
          </TextField>
        </ComponentEntrance>
        {!error && query.kind === 'album' && albumList.data?.items.length ? (
          <SharesList
            items={albumList.data.items}
            total={albumList.data.total}
            timeZone={props.timeZone}
            disabled={list.isFetching}
            returnTo={query.href}
            onNavigate={rememberReturn}
          />
        ) : null}
        {!error && query.kind === 'image' && imageList.data?.items.length ? (
          <ImageSharesList
            items={imageList.data.items}
            total={imageList.data.total}
            timeZone={props.timeZone}
            disabled={list.isFetching}
            onSessionExpire={expire}
            onRefresh={() => {
              void imageList.refetch();
            }}
          />
        ) : null}
        {data?.items.length === 0 ? (
          <ComponentEntrance
            data-testid="shares-empty"
            className="grid min-h-80 content-center justify-items-center gap-4 text-center"
          >
            <LinkIcon size={36} aria-hidden />
            <h2 className="text-xl">
              {q
                ? query.kind === 'image'
                  ? '没有找到分享图片'
                  : '没有找到分享相册'
                : data.total
                  ? '本页已无分享'
                  : '还没有分享链接'}
            </h2>
            {page > 1 ? (
              <Button
                className="h-12 rounded-lg font-normal"
                onPress={() => query.change({ page: 1 })}
              >
                返回第一页
              </Button>
            ) : !q ? (
              <Link
                href={query.kind === 'image' ? '/library' : '/albums'}
                className="h-12 justify-center rounded-lg bg-accent px-6 text-sm font-normal text-accent-foreground no-underline"
              >
                {query.kind === 'image' ? '前往图库' : '前往相册'}
              </Link>
            ) : null}
          </ComponentEntrance>
        ) : null}
        {error ? (
          <Alert status="danger" data-testid="shares-error">
            <Alert.Content>
              <Alert.Title>分享列表加载失败</Alert.Title>
              <Alert.Description>{error.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </section>
    </OwnerShell>
  );
}
