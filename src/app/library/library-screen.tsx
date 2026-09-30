'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Images } from 'lucide-react';
import { OwnerShell } from '../../components/shell/owner-shell';
import { useResetUpload } from '../../components/upload/provider';
import type { LibraryDetail as Detail } from '../../server/library/detail-types';
import { LibraryLoading } from './library-loading';
import { useDetailNavigation } from './use-detail-navigation';
import { LibraryDetail } from '../../components/library/detail';
import { LibraryFooter, LibraryToolbar } from './library-controls';
import { LibraryFiltersDialog } from './library-filters';
import { LibraryGallery } from './library-gallery';
import { LibraryReadError, useLibraryQuery } from './use-library-query';

export function LibraryScreen(props: {
  name: string;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  timeZone: string;
  albumId?: string;
  header?: ReactNode;
  children?: ReactNode;
  onImageRemoved?: () => void;
}) {
  const resetUpload = useResetUpload();
  const detail = useDetailNavigation();
  const pathname = usePathname();
  const params = useSearchParams();
  const returnTo = `${pathname}${params.size ? `?${params}` : ''}`;
  const [client] = useState(() => new QueryClient());
  const query = useLibraryQuery(client, { albumId: props.albumId });
  const [notice, setNotice] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [albumSearch, setAlbumSearch] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);
  const filterTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => () => client.clear(), [client]);
  const expireSession = useCallback(() => {
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [resetUpload, client, returnTo]);
  useEffect(() => {
    if (query.expired) expireSession();
  }, [query.expired, expireSession]);
  async function onTrashed(record: Detail) {
    setNotice(
      `已将 ${record.displayName} 移入回收站。文件仍占用空间，不会自动清理。`,
    );
    detail.close();
    await query.onItemRemoved(record.id);
    props.onImageRemoved?.();
  }
  async function loadMore() {
    const result = await query.loadMore();
    if (!result) return;
    requestAnimationFrame(() => {
      if (result.hasNextPage) moreRef.current?.focus({ preventScroll: true });
      else endRef.current?.focus({ preventScroll: true });
    });
  }
  const filtered =
    query.filters &&
    !!(
      query.filters.q ||
      query.filters.tagIds.length ||
      query.filters.uploadedFrom ||
      query.filters.uploadedBefore ||
      query.filters.format ||
      query.filters.storageId ||
      query.filters.visibility ||
      query.filters.status ||
      (!props.albumId && query.filters.albumId)
    );
  function openFilters() {
    filterTrigger.current = document.activeElement as HTMLElement;
    setFilterOpen(true);
  }
  const invalid =
    query.queryError ||
    (query.error instanceof LibraryReadError && query.error.status === 400);
  return (
    <OwnerShell
      {...props}
      returnTo={returnTo}
      footer={<LibraryFooter query={query} />}
    >
      <section
        className="grid min-w-0 gap-5 xl:gap-6"
        aria-labelledby="library-title"
        data-testid="library-list"
        data-loaded-count={query.items.length}
        data-layout={query.layout}
        data-loading-mode={query.loadingMode}
      >
        {notice ? <p role="status">{notice}</p> : null}
        {props.header ?? (
          <div className="grid min-h-19 gap-1.5">
            <h1
              id="library-title"
              tabIndex={-1}
              className="text-[30px] font-medium leading-normal"
            >
              图库
            </h1>
            <p className="text-sm">保存每一刻，也让每一次查找更轻松。</p>
          </div>
        )}
        {props.albumId && !albumSearch ? (
          <Button
            variant="outline"
            className="h-12 w-full rounded-lg font-normal md:w-60"
            onPress={() => setAlbumSearch(true)}
          >
            搜索与筛选
          </Button>
        ) : (
          <LibraryToolbar
            query={query}
            onFilter={openFilters}
            album={!!props.albumId}
          />
        )}
        {filtered ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p>
              已应用筛选{query.filters?.q ? `：${query.filters.q}` : ''}
              {query.filters?.tagIds.length
                ? ` · ${query.filters.tagIds.length} 个标签（任一匹配）`
                : ''}
            </p>
            <Button
              variant="outline"
              className="min-h-11 rounded-lg font-normal"
              onPress={openFilters}
            >
              修改筛选
            </Button>
            <Button
              variant="outline"
              className="min-h-11 rounded-lg font-normal"
              onPress={query.resetQuery}
            >
              清除筛选
            </Button>
          </div>
        ) : null}
        {query.refreshAvailable ? (
          <Alert status="default">
            <Alert.Content>
              <Alert.Description>
                图片列表可能已变化，刷新以获取最新顺序。
              </Alert.Description>
            </Alert.Content>
            <Button
              variant="outline"
              className="min-h-11 rounded-lg"
              isDisabled={query.isFetching}
              onPress={() => {
                void query.refresh();
              }}
            >
              刷新图库
            </Button>
          </Alert>
        ) : null}
        {query.expired ? (
          <p role="alert">登录已失效，正在返回登录页。</p>
        ) : (
          <>
            {query.isPending ? <LibraryLoading /> : null}
            {query.error ? (
              <Alert status="danger" role="alert" data-testid="library-error">
                <Alert.Content>
                  <Alert.Title>
                    {invalid
                      ? '查询条件或加载位置无效'
                      : query.items.length
                        ? '更多图片加载失败'
                        : '图片列表加载失败'}
                  </Alert.Title>
                  <Alert.Description>
                    {query.error.message}{' '}
                    {query.items.length ? '已加载的图片仍保留。' : ''}
                  </Alert.Description>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      className="min-h-11 rounded-lg"
                      onPress={() => {
                        void query.refresh();
                      }}
                    >
                      重试加载
                    </Button>
                    {invalid ? (
                      <Button
                        className="min-h-11 rounded-lg"
                        onPress={query.resetQuery}
                      >
                        重置查询
                      </Button>
                    ) : null}
                  </div>
                </Alert.Content>
              </Alert>
            ) : null}
            {!query.isPending && !query.error && query.items.length === 0 ? (
              <div
                data-testid="library-empty"
                className="grid min-h-60 content-center justify-items-center gap-3 text-center md:min-h-90"
              >
                <Images size={36} aria-hidden />
                <h2 className="text-xl font-medium">
                  {query.total
                    ? '本页已无图片'
                    : filtered
                      ? '没有找到匹配图片'
                      : props.albumId
                        ? '相册还没有图片'
                        : '图库还没有图片'}
                </h2>
                <p className="text-sm">
                  {query.total
                    ? '图片数量已变化，请返回有效页。'
                    : filtered
                      ? '请修改或清除筛选条件。'
                      : props.albumId
                        ? '添加图片后，会按加入时间从新到旧显示。'
                        : '上传第一张图片，开始整理你的图库。'}
                </p>
                {query.page > 1 ? (
                  <Button
                    className="min-h-11 rounded-lg"
                    onPress={() => {
                      void query.setPage(1);
                    }}
                  >
                    返回第一页
                  </Button>
                ) : filtered ? (
                  <Button
                    className="min-h-11 rounded-lg"
                    onPress={query.resetQuery}
                  >
                    清除筛选
                  </Button>
                ) : null}
              </div>
            ) : null}
            {query.items.length ? (
              <LibraryGallery
                items={query.items}
                layout={query.layout}
                album={!!props.albumId}
                disabled={!query.canOperate}
                onOpen={detail.open}
              />
            ) : null}
            {query.hasMore ? (
              <Button
                ref={moreRef}
                data-testid="library-load-more"
                variant="outline"
                className="min-h-11 w-full rounded-lg font-normal md:w-36 xl:min-h-9"
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
            {query.pages.length &&
            !query.hasMore &&
            query.total !== 0 &&
            query.loadingMode === 'more' ? (
              <p ref={endRef} tabIndex={-1} className="text-sm text-muted">
                已加载全部图片
              </p>
            ) : null}
            {!query.refreshAvailable ? (
              <Button
                variant="ghost"
                className="min-h-11 w-fit rounded-lg text-sm font-normal"
                isDisabled={query.isFetching}
                onPress={() => {
                  void query.refresh();
                }}
              >
                刷新图库
              </Button>
            ) : null}
          </>
        )}
      </section>
      {query.filters ? (
        <LibraryFiltersDialog
          key={filterOpen ? 'open' : 'closed'}
          isOpen={filterOpen}
          onOpenChange={(open) => {
            setFilterOpen(open);
            if (!open)
              requestAnimationFrame(() => filterTrigger.current?.focus());
          }}
          filters={query.filters}
          timeZone={props.timeZone}
          fixedAlbumId={props.albumId}
          onSessionExpired={expireSession}
          onApply={(patch) => {
            void query.applyQuery(patch);
            setFilterOpen(false);
            requestAnimationFrame(() => filterTrigger.current?.focus());
          }}
        />
      ) : null}
      {detail.imageId ? (
        <LibraryDetail
          key={detail.imageId}
          imageId={detail.imageId}
          albumId={props.albumId}
          returnTo={returnTo}
          client={client}
          onClose={detail.close}
          onTrashed={onTrashed}
          dialogRef={detail.dialogRef}
        />
      ) : null}
      {props.children}
    </OwnerShell>
  );
}
