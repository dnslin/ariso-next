'use client';

import { useEffect, useRef, useState } from 'react';
import { QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { OwnerShell } from '../../components/shell/owner-shell';
import type { LibraryDetail as Detail } from '../../server/library/detail-types';
import type { LibraryPage } from '../../server/library/types';
import { LibraryLoading } from './library-loading';
import { LibraryCard } from './library-card';
import { useDetailNavigation } from './use-detail-navigation';
import { LibraryDetail } from '../../components/library/detail';

class ListReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readPage(
  cursor: string | null,
  signal: AbortSignal,
): Promise<LibraryPage> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : '';
  let response: Response;
  try {
    response = await fetch(`/api/images${query}`, {
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('连接中断，无法读取图片列表，请检查网络后重试。', {
      cause: error,
    });
  }
  if (!response.ok)
    throw new ListReadError(
      `图片列表读取失败（HTTP ${response.status}），请重试。`,
      response.status,
    );
  return response.json();
}

export function LibraryScreen({
  name,
  description,
  email,
  ownerName,
  initialSidebarCollapsed,
}: {
  name: string;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
}) {
  const detail = useDetailNavigation();
  const [notice, setNotice] = useState('');
  function onTrashed(record: Detail) {
    void client.cancelQueries({ queryKey: ['library'] });
    client.setQueriesData<{ pages: LibraryPage[]; pageParams: unknown[] }>(
      { queryKey: ['library'] },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== record.id),
              })),
            }
          : data,
    );
    setNotice(
      `已将 ${record.displayName} 移入回收站。文件仍占用空间，不会自动清理。`,
    );
    detail.close();
    void client.invalidateQueries({ queryKey: ['library'] });
  }
  // 管理数据只活在当前图库页面；离开或失效后不保留私有卡片缓存。
  const [client] = useState(() => new QueryClient());
  const query = useInfiniteQuery(
    {
      queryKey: ['library', 'uploaded_desc', 40],
      queryFn: ({ pageParam, signal }) => readPage(pageParam, signal),
      initialPageParam: null as string | null,
      getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
      retry: false,
      networkMode: 'always',
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    client,
  );
  const moreRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);
  const busy = useRef(false);
  const expired =
    query.error instanceof ListReadError && query.error.status === 401;
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (!expired) return;
    client.clear();
    window.location.replace('/login?reason=expired&returnTo=%2Flibrary');
  }, [client, expired]);

  const pages = expired ? [] : (query.data?.pages ?? []);
  const items = [
    ...new Map(
      pages.flatMap((page) => page.items).map((item) => [item.id, item]),
    ).values(),
  ];
  const total = pages.at(-1)?.total;
  const count =
    total === undefined
      ? '数量待确认'
      : `${total.toLocaleString('zh-CN')} 张图片 · 已加载 ${items.length} 张`;

  async function loadMore() {
    if (busy.current || query.isFetching || !query.hasNextPage) return;
    busy.current = true;
    try {
      const result = await query.fetchNextPage({ cancelRefetch: false });
      requestAnimationFrame(() => {
        if (result.hasNextPage) moreRef.current?.focus({ preventScroll: true });
        else endRef.current?.focus({ preventScroll: true });
      });
    } finally {
      busy.current = false;
    }
  }

  return (
    <OwnerShell
      name={name}
      description={description}
      email={email}
      ownerName={ownerName}
      initialSidebarCollapsed={initialSidebarCollapsed}
      footer={
        <p data-testid="library-count" role="status" className="w-full text-sm">
          {expired ? '登录已失效' : count}
        </p>
      }
    >
      <section
        className="grid min-w-0 gap-5 xl:gap-6"
        aria-labelledby="library-title"
      >
        {notice ? <p role="status">{notice}</p> : null}
        <div className="grid gap-1.5">
          <h1
            id="library-title"
            tabIndex={-1}
            className="text-[28px] font-medium leading-normal md:text-[30px]"
          >
            图库
          </h1>
          <p className="text-sm">保存每一刻，也让每一次查找更轻松。</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">上传时间从新到旧 · 每批 40 张</p>
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            isDisabled={query.isFetching || expired}
            onPress={() => {
              void client.resetQueries({ queryKey: ['library'] });
            }}
          >
            刷新图库
          </Button>
        </div>
        {expired ? (
          <p role="alert">登录已失效，正在返回登录页。</p>
        ) : (
          <>
            {query.isPending ? <LibraryLoading /> : null}
            {query.isError ? (
              <Alert status="danger" role="alert" data-testid="library-error">
                <Alert.Content>
                  <Alert.Title>
                    {items.length ? '更多图片加载失败' : '图片列表加载失败'}
                  </Alert.Title>
                  <Alert.Description>
                    {query.error.message}{' '}
                    {items.length ? '已加载的图片仍保留。' : ''}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            {!query.isPending && !query.isError && total === 0 ? (
              <div
                data-testid="library-empty"
                className="grid min-h-60 content-center gap-2 text-center md:min-h-90"
              >
                <h2 className="text-xl font-medium">图库还没有图片</h2>
                <p className="text-sm">上传第一张图片，开始整理你的图库。</p>
              </div>
            ) : null}
            {items.length ? (
              <ul
                data-testid="library-grid"
                aria-label="图库图片"
                className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 xl:grid-cols-4 xl:gap-5"
              >
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_300px]"
                  >
                    <LibraryCard item={item} onOpen={detail.open} />
                  </li>
                ))}
              </ul>
            ) : null}
            {query.isError && !pages.length ? (
              <Button
                variant="primary"
                className="min-h-11 w-full rounded-lg md:w-36"
                onPress={() => {
                  void query.refetch();
                }}
              >
                重试加载
              </Button>
            ) : null}
            {query.hasNextPage ? (
              <Button
                ref={moreRef}
                data-testid="library-load-more"
                variant="outline"
                className="min-h-11 w-full rounded-lg md:w-44"
                isDisabled={query.isFetching}
                onPress={() => {
                  void loadMore();
                }}
              >
                {query.isFetchingNextPage
                  ? '正在加载更多…'
                  : query.isFetchNextPageError
                    ? '重试加载更多'
                    : '加载更多'}
              </Button>
            ) : null}
            {pages.length && !query.hasNextPage && total !== 0 ? (
              <p ref={endRef} tabIndex={-1} className="text-sm text-muted">
                已加载全部图片
              </p>
            ) : null}
          </>
        )}
      </section>
      {detail.imageId ? (
        <LibraryDetail
          key={detail.imageId}
          imageId={detail.imageId}
          returnTo={`/library?${new URLSearchParams({ image: detail.imageId })}`}
          client={client}
          onClose={detail.close}
          onTrashed={onTrashed}
          dialogRef={detail.dialogRef}
        />
      ) : null}
    </OwnerShell>
  );
}
