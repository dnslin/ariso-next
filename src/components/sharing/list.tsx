import { Button } from '@heroui/react/button';
import { EmptyState } from '@heroui/react/empty-state';
import { useState } from 'react';
import { Skeleton } from '@heroui/react/skeleton';
import { Spinner } from '@heroui/react/spinner';
import { Images } from 'lucide-react';
import type { PublicSharePage } from '../../server/sharing/public-types';
import { ShareBrandHeading, type ShareBrand } from './brand';
import { ShareGallery } from './gallery';
import { ShareThumbnail } from './thumbnail';

export function ShareList({
  page,
  brand,
  loading,
  refreshing,
  loadError,
  refreshError,
  cursorInvalid,
  revision,
  onLoadMore,
  onReload,
  onCheck,
}: {
  page: PublicSharePage;
  brand: ShareBrand;
  loading: boolean;
  refreshing: boolean;
  loadError: string;
  refreshError: string;
  cursorInvalid: boolean;
  revision: number;
  onLoadMore: () => void;
  onReload: () => void;
  onCheck: () => void;
}) {
  const [failed, setFailed] = useState({ revision: -1, ids: [] as string[] });
  function onThumbnailFailure(id: string) {
    setFailed((current) => {
      const ids = current.revision === revision ? current.ids : [];
      return ids.includes(id) ? current : { revision, ids: [...ids, id] };
    });
  }
  const hasFailed = (id: string) =>
    failed.revision === revision && failed.ids.includes(id);
  const placeholder =
    (page.cover !== null &&
      (page.cover.status !== 'ready' || hasFailed(page.cover.imageId))) ||
    page.items.some(
      (item) => item.status !== 'ready' || hasFailed(item.imageId),
    );
  return (
    <section className="flex h-dvh flex-col">
      <div className="shrink-0 pt-[58px] pb-[21px] min-[768px]:pt-12">
        <ShareBrandHeading brand={brand} />
      </div>
      <div
        data-share-scroll
        className="mx-auto w-full max-w-[1192px] min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-8 min-[768px]:px-6 min-[1200px]:px-4"
      >
        <div
          className="flex flex-col gap-5 min-[768px]:gap-6"
          aria-busy={loading}
        >
          <div
            data-share-cover
            className="h-40 shrink-0 overflow-hidden rounded-xl min-[768px]:h-60 min-[1200px]:h-[280px]"
          >
            {cursorInvalid ? (
              <div className="bg-default flex size-full items-center justify-center text-sm leading-[22px]">
                相册已更新
              </div>
            ) : (
              <ShareThumbnail
                key={`cover-${revision}`}
                item={page.cover}
                cover
                onFailure={onThumbnailFailure}
              />
            )}
          </div>
          <header className="grid min-w-0 gap-2 min-[768px]:grid-cols-[minmax(0,1fr)_auto] min-[768px]:gap-x-6 min-[768px]:items-baseline">
            <h1 className="text-[28px] leading-9 font-medium tracking-[-0.025em] break-words min-[1200px]:text-[32px] min-[1200px]:leading-10">
              {page.albumName}
            </h1>
            {cursorInvalid || page.description ? (
              <p className="text-muted text-sm leading-[22px] min-[768px]:col-span-2 min-[768px]:row-start-2">
                {cursorInvalid ? '相册内容发生了变化。' : page.description}
              </p>
            ) : null}
            <p className="text-muted flex flex-wrap items-baseline gap-2 text-[13px] leading-[22px] tabular-nums min-[768px]:col-start-2 min-[768px]:row-start-1 min-[768px]:text-sm">
              {cursorInvalid ? (
                '请刷新相册后继续浏览。'
              ) : page.total === 0 ? (
                `${page.total} 张图片`
              ) : !page.hasMore && page.items.length === page.total ? (
                `已显示全部 ${page.total} 张图片`
              ) : (
                <>
                  <strong className="text-foreground font-medium">
                    {page.total} 张图片
                  </strong>
                  <span className="text-border" aria-hidden="true">
                    ·
                  </span>
                  <span>已加载 {page.items.length} 张</span>
                </>
              )}
            </p>
          </header>
          {refreshError ? (
            <div
              data-testid="share-refresh-error"
              role="status"
              className="text-muted -mt-2 flex min-h-11 items-center gap-3 text-[13px] leading-[22px] min-[768px]:gap-4 min-[768px]:text-sm"
            >
              <p className="min-w-0">状态检查失败，当前内容已保留。</p>
              <Button
                data-testid="share-check-retry"
                variant="outline"
                className="min-h-11 min-w-16 shrink-0 rounded-lg text-sm min-[768px]:min-w-18"
                isDisabled={refreshing}
                onPress={onCheck}
              >
                {refreshing ? <Spinner size="sm" /> : null}
                {refreshing ? '检查中' : '重试'}
              </Button>
            </div>
          ) : null}
          {cursorInvalid ? (
            <div
              data-testid="share-cursor-invalid"
              role="status"
              className="grid h-[220px] content-center text-center min-[768px]:h-[280px]"
            >
              <h2 className="text-[22px] leading-8 font-medium">
                请刷新后继续浏览
              </h2>
            </div>
          ) : page.items.length ? (
            <ShareGallery
              key={revision}
              items={page.items}
              layout={page.layout}
              showName={page.showName}
              onThumbnailFailure={onThumbnailFailure}
            />
          ) : loading ? (
            <div
              aria-label="正在加载图片"
              className="grid grid-cols-2 gap-3 min-[768px]:grid-cols-3 min-[1200px]:grid-cols-4"
            >
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="aspect-[4/3] rounded-xl" />
              ))}
            </div>
          ) : (
            <EmptyState
              data-testid="share-empty"
              className="text-muted grid h-[220px] content-center justify-items-center gap-3 p-0 text-center min-[768px]:h-[280px]"
              role="status"
            >
              <Images size={36} aria-hidden="true" />
              <p className="text-sm leading-[22px]">暂无可展示的图片</p>
            </EmptyState>
          )}
          {cursorInvalid ? (
            <Button
              data-testid="share-refresh"
              className="h-12 shrink-0 rounded-lg text-sm font-normal"
              isDisabled={loading}
              onPress={onReload}
            >
              {loading ? <Spinner size="sm" /> : null}刷新相册
            </Button>
          ) : null}
          {loadError && !cursorInvalid ? (
            <p
              data-testid="share-load-error"
              role="status"
              className="text-sm leading-[22px]"
            >
              加载失败，已有内容已保留。请重试。
            </p>
          ) : null}
          {page.hasMore && !cursorInvalid ? (
            <Button
              data-testid="share-load-more"
              className="h-12 shrink-0 rounded-lg text-sm font-normal"
              isDisabled={loading}
              onPress={onLoadMore}
            >
              {loading ? <Spinner size="sm" /> : null}
              {loading ? '正在加载…' : loadError ? '重试加载更多' : '加载更多'}
            </Button>
          ) : null}
          {placeholder && !cursorInvalid ? (
            <Button
              data-testid="share-reload"
              className="h-12 shrink-0 rounded-lg text-sm font-normal"
              isDisabled={loading}
              onPress={onReload}
            >
              重新加载
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
