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
import { useDetailQuery } from '../../components/library/use-detail-query';
import { useDetailReprocess } from '../../components/library/use-detail-reprocess';
import {
  DetailReprocess,
  DetailReprocessFooter,
} from '../../components/library/detail-reprocess';
import {
  DetailVersions,
  DetailVersionsFooter,
} from '../../components/library/detail-workspace';
import { initialPreview } from '../../components/library/detail-preview';
import { LibraryFooter, LibraryToolbar } from './library-controls';
import { LibraryFiltersBar } from './library-filters';
import { LibraryGallery } from './library-gallery';
import {
  LibrarySelectionMenu,
  type LibraryContextMenu,
} from './library-selection-menu';
import { useLibrarySelection } from './use-library-selection';
import { useSelectionReconciliation } from './use-selection-reconciliation';
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
  afterToolbar?: ReactNode;
  workspace?: { content: ReactNode; footer: ReactNode };
  onRefresh?: () => void;
  onImageRemoved?: () => void;
}) {
  const resetUpload = useResetUpload();
  const detail = useDetailNavigation();
  const pathname = usePathname();
  const params = useSearchParams();
  const returnTo = `${pathname}${params.size ? `?${params}` : ''}`;
  const [client] = useState(() => new QueryClient());
  const query = useLibraryQuery(client, { albumId: props.albumId });
  const detailQuery = useDetailQuery(
    client,
    detail.imageId,
    returnTo,
    props.albumId,
  );
  const reprocess = useDetailReprocess(detail.imageId, detailQuery);
  const preview = params.get('preview');
  const selectedPreview =
    preview &&
    ['original', 'compressed', 'thumbnail', 'watermark'].includes(preview)
      ? preview
      : undefined;
  const selectionIdentity = JSON.stringify([
    props.albumId,
    query.filters,
    query.loadingMode,
  ]);
  const selection = useLibrarySelection(selectionIdentity, query.items);
  const [notice, setNotice] = useState('');
  const [contextMenu, setContextMenu] = useState<
    (LibraryContextMenu & { identity: string }) | null
  >(null);
  if (
    contextMenu &&
    (contextMenu.identity !== selectionIdentity || !selection.selected.size)
  ) {
    setContextMenu(null);
  }
  const moreRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => client.clear(), [client]);
  const expireSession = useCallback(() => {
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [resetUpload, client, returnTo]);
  const reconciliation = useSelectionReconciliation({
    selection,
    identity: selectionIdentity,
    filters: query.filters,
    dataUpdatedAt: query.dataUpdatedAt,
    onSessionExpired: expireSession,
    onInvalid: query.onSelectionInvalid,
  });
  useEffect(() => {
    if (query.expired) expireSession();
  }, [query.expired, expireSession]);
  async function onTrashed(record: Detail) {
    setNotice(
      `已将 ${record.displayName} 移入回收站。文件仍占用空间，不会自动清理。`,
    );
    selection.remove(record.id);
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
  const invalid =
    query.queryError ||
    (query.error instanceof LibraryReadError && query.error.status === 400);
  return (
    <OwnerShell
      {...props}
      returnTo={returnTo}
      footer={
        detail.view === 'reprocess' &&
        reprocess.confirmed &&
        !reprocess.receipt ? null : detail.view === 'reprocess' ? (
          <DetailReprocessFooter
            detail={detailQuery.data}
            state={reprocess}
            query={detailQuery}
            onReturn={detail.returnToDetail}
            onClose={detail.close}
            onVersions={() => detail.openView('versions')}
          />
        ) : detail.view ? (
          <DetailVersionsFooter
            detail={detailQuery.data}
            onReturn={detail.returnToDetail}
            onReprocess={() => {
              const job = detailQuery.data?.processingJob;
              if (
                job?.id === reprocess.receipt?.jobId &&
                job &&
                ['succeeded', 'failed', 'cancelled'].includes(job.status)
              )
                reprocess.reset();
              detail.openView('reprocess');
            }}
          />
        ) : props.workspace ? (
          props.workspace.footer
        ) : (
          <LibraryFooter query={query} />
        )
      }
    >
      <div className={props.workspace || detail.view ? 'hidden' : 'contents'}>
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
          <div className="grid min-w-0 gap-2">
            <LibraryToolbar
              query={{
                ...query,
                refresh: async () => {
                  await query.refresh();
                  props.onRefresh?.();
                },
              }}
              album={!!props.albumId}
              selectionMenu={
                selection.selected.size ? (
                  <LibrarySelectionMenu
                    key={selectionIdentity}
                    selection={selection}
                    contextMenu={contextMenu}
                    onContextMenuClose={() => setContextMenu(null)}
                    loadingMode={query.loadingMode}
                    disabled={!query.canOperate || reconciliation.pending}
                    onOpen={detail.open}
                  />
                ) : undefined
              }
            />
            {query.filters ? (
              <LibraryFiltersBar
                filters={query.filters}
                timeZone={props.timeZone}
                fixedAlbumId={props.albumId}
                onSessionExpired={expireSession}
                onApply={(patch) => void query.applyQuery(patch)}
              />
            ) : null}
          </div>
          {props.afterToolbar}
          {reconciliation.error ? (
            <Alert
              status="danger"
              role="alert"
              data-testid="library-selection-error"
            >
              <Alert.Content>
                <Alert.Title>选择状态核对失败</Alert.Title>
                <Alert.Description>
                  {reconciliation.error} 已保留全部选择，请重试核对。
                </Alert.Description>
                <Button
                  variant="outline"
                  className="mt-3 min-h-11 rounded-lg"
                  onPress={reconciliation.retry}
                >
                  重试核对
                </Button>
              </Alert.Content>
            </Alert>
          ) : null}
          {reconciliation.removedCount ? (
            <p
              role="status"
              data-testid="library-selection-notice"
              className="text-sm"
            >
              已移除 {reconciliation.removedCount}{' '}
              张已删除、已回收或不再匹配当前查询的图片。
            </p>
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
                  disabled={
                    !query.canOperate ||
                    reconciliation.pending ||
                    !!detail.imageId
                  }
                  selection={selection}
                  onOpen={detail.open}
                  onContextMenu={(menu) =>
                    setContextMenu({ ...menu, identity: selectionIdentity })
                  }
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
            </>
          )}
        </section>
        {props.children}
      </div>
      {detail.view &&
      detailQuery.data &&
      (!detailQuery.isError || detail.view === 'reprocess') &&
      !detailQuery.expired ? (
        detail.view === 'reprocess' ? (
          <DetailReprocess
            detail={detailQuery.data}
            state={reprocess}
            query={detailQuery}
            onReturn={detail.returnToDetail}
          />
        ) : (
          <DetailVersions
            detail={detailQuery.data}
            selected={selectedPreview ?? initialPreview(detailQuery.data)}
            onClose={detail.close}
          />
        )
      ) : null}
      {detail.view && detailQuery.isPending ? (
        <p role="status">正在读取图片详情…</p>
      ) : null}
      {detail.view && detailQuery.statusError && !detailQuery.expired ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>任务状态读取失败</Alert.Title>
            <Alert.Description>
              {detailQuery.statusError.message}{' '}
              当前版本和最后读取的任务状态仍保留。
            </Alert.Description>
            <Button
              variant="outline"
              className="mt-3 min-h-11"
              onPress={() => {
                void detailQuery.retryStatus();
              }}
            >
              重试任务状态
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {detail.view && detailQuery.isError ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>图片详情读取失败</Alert.Title>
            <Alert.Description>{detailQuery.error.message}</Alert.Description>
            <Button
              variant="outline"
              className="mt-3 min-h-11"
              onPress={() => {
                void detailQuery.refetch();
              }}
            >
              刷新详情
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {detail.imageId ? (
        <LibraryDetail
          key={detail.imageId}
          imageId={detail.imageId}
          query={detailQuery}
          hidden={!!detail.view}
          onVersions={(selected) => detail.openView('versions', selected)}
          initialSelected={selectedPreview}
          albumId={props.albumId}
          client={client}
          onClose={detail.close}
          onTrashed={onTrashed}
          dialogRef={detail.dialogRef}
        />
      ) : null}
      {props.workspace?.content}
    </OwnerShell>
  );
}
