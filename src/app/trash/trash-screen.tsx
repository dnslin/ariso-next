'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { Tooltip } from '@heroui/react/tooltip';
import { Spinner } from '@heroui/react/spinner';
import { RefreshCw, Trash2 } from 'lucide-react';
import { OwnerShell } from '../../components/shell/owner-shell';
import { TrashAction } from '../../components/library/trash-actions';
import {
  DetailReadError,
  readDetail,
} from '../../components/library/read-detail';
import {
  bytesLabel,
  processingLabels,
} from '../../components/library/detail-labels';
import type { TrashPage } from '../../server/library/trash-types';
import type { LibraryDetail } from '../../server/library/detail-types';
import { TrashRecord } from './trash-record';
import { TrashThumbnail } from './trash-thumbnail';

async function readPage(page: number, signal: AbortSignal): Promise<TrashPage> {
  const response = await fetch(`/api/trash?page=${page}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok)
    throw new DetailReadError(
      `回收记录读取失败（HTTP ${response.status}），请重试。`,
      response.status,
    );
  return response.json();
}

export function TrashScreen({
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
  const params = useSearchParams();
  const imageId = params.get('image');
  const [page, setPage] = useState(1);
  const [client] = useState(() => new QueryClient());
  const [mutationPending, setMutationPending] = useState(false);
  const onMutationPending = useCallback(
    (pending: boolean) => {
      if (pending)
        void client.cancelQueries({
          queryKey: ['trash-detail', imageId],
          exact: true,
        });
      setMutationPending(pending);
    },
    [client, imageId],
  );
  const [result, setResult] = useState<LibraryDetail | null>(null);
  const [unavailable, setUnavailable] = useState<{
    id: string;
    status: 401 | 404;
  } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const list = useQuery(
    {
      queryKey: ['trash', page],
      queryFn: ({ signal }) => readPage(page, signal),
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  const detail = useQuery(
    {
      queryKey: ['trash-detail', imageId],
      queryFn: ({ signal }) => readDetail(imageId!, signal),
      enabled: !!imageId && unavailable?.id !== imageId && !mutationPending,
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  const error = imageId ? detail.error : list.error;
  const missing = unavailable?.id === imageId && unavailable.status === 404;
  const expired =
    unavailable?.status === 401 ||
    (error instanceof DetailReadError && error.status === 401);
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (!expired) return;
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }, [client, expired]);
  useEffect(() => {
    const target = imageId
      ? document.getElementById('trash-record-title')
      : trigger.current?.isConnected
        ? trigger.current
        : document.getElementById('trash-title');
    target?.focus({ preventScroll: true });
  }, [imageId, detail.isSuccess]);

  function closeRecord() {
    const url = new URL(window.location.href);
    url.searchParams.delete('image');
    window.history.replaceState(null, '', url);
  }
  function restored(record: LibraryDetail) {
    setResult(record);
    client.setQueriesData<TrashPage>({ queryKey: ['trash'] }, (data) =>
      data
        ? {
            ...data,
            items: data.items.filter((item) => item.id !== record.id),
            total: Math.max(0, data.total - 1),
          }
        : data,
    );
    closeRecord();
    void client.invalidateQueries({ queryKey: ['trash'] });
  }
  const record =
    !detail.isError && !expired && !missing ? detail.data : undefined;
  const data = !expired ? list.data : undefined;
  const pages = data ? Math.max(1, Math.ceil(data.total / 40)) : null;
  return (
    <OwnerShell
      name={name}
      description={description}
      email={email}
      ownerName={ownerName}
      initialSidebarCollapsed={initialSidebarCollapsed}
      returnTo={
        imageId ? `/trash?${new URLSearchParams({ image: imageId })}` : '/trash'
      }
      footer={
        imageId ? (
          <div className="flex w-full items-end gap-3 md:justify-end [&>div]:flex-1 md:[&>div]:max-w-60">
            <Button
              variant="outline"
              className="min-h-12 flex-1 rounded-lg md:max-w-50"
              onPress={closeRecord}
            >
              返回回收站
            </Button>
            {record ? (
              <TrashAction
                key={record.id}
                record={record}
                operation="restore"
                onPending={onMutationPending}
                onVerified={(current) =>
                  client.setQueryData(['trash-detail', imageId], current)
                }
                onComplete={restored}
                onUnavailable={(status) => {
                  setUnavailable({ id: imageId, status });
                  if (status === 404)
                    void client.invalidateQueries({ queryKey: ['trash'] });
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="grid w-full gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <p data-testid="trash-count" role="status" className="text-sm">
              {data
                ? `共 ${data.total} 项 · 40 条 / 页 · ${page} / ${pages}`
                : '数量待确认'}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-lg md:w-30"
                isDisabled={page === 1 || list.isFetching}
                onPress={() => setPage((value) => value - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-lg md:w-30"
                isDisabled={!data?.hasMore || list.isFetching}
                onPress={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        )
      }
    >
      {imageId ? (
        <>
          {missing ? (
            <p role="alert">图片记录已不存在，无法恢复。请返回回收站。</p>
          ) : null}
          {detail.isPending ? (
            <p role="status">
              <Spinner size="sm" />
              正在读取回收记录…
            </p>
          ) : null}
          {record ? <TrashRecord record={record} onBack={closeRecord} /> : null}
        </>
      ) : (
        <section className="grid min-w-0 gap-5">
          <div className="flex items-center justify-between gap-4">
            <h1
              id="trash-title"
              tabIndex={-1}
              className="text-[28px] font-medium leading-normal md:text-[30px]"
            >
              回收站
            </h1>
            <Tooltip>
              <Button
                isIconOnly
                variant="outline"
                aria-label="刷新回收站"
                className="size-11 shrink-0 rounded-lg"
                isDisabled={list.isFetching}
                onPress={() => {
                  void list.refetch();
                }}
              >
                <RefreshCw size={18} aria-hidden />
              </Button>
              <Tooltip.Content>刷新回收站</Tooltip.Content>
            </Tooltip>
          </div>
          <p className="text-sm">
            {data ? `${data.total} 条记录 · ` : ''}
            文件仍占用空间，不会自动清理。
          </p>
          {result ? (
            <Alert
              data-testid="trash-result"
              status={result.storage.enabled ? 'success' : 'warning'}
            >
              <Alert.Content>
                <Alert.Title>
                  {result.storage.enabled
                    ? '记录已恢复'
                    : '记录已恢复，存储仍停用'}
                </Alert.Title>
                <Alert.Description>
                  {result.displayName} 已移回图库。
                  {result.storage.enabled
                    ? `当前${processingLabels[result.processingStatus]}，${result.visibility === 'private' ? '私有图片仍仅所有者可读。' : '内容访问遵循当前处理结果。'}`
                    : '图片内容暂不可访问，不会自动启用存储。'}
                  保留原 ID、可见性和仍存在的关系，不重启处理任务。
                </Alert.Description>
                <Link
                  href={`/library?${new URLSearchParams({ image: result.id })}`}
                  className="min-h-11"
                >
                  前往图库
                </Link>
              </Alert.Content>
            </Alert>
          ) : null}
          <p className="rounded-lg bg-default p-3 text-sm">
            预览仅登录的管理员可见，原有外链仍不可访问。点击图片查看详情或恢复。
          </p>
          {list.isPending ? (
            <p role="status">
              <Spinner size="sm" />
              正在读取回收记录…
            </p>
          ) : null}
          {data?.items.length ? (
            <Card className="gap-0 rounded-2xl border border-border bg-background p-3 shadow-none md:px-5">
              <Card.Content>
                <ul data-testid="trash-list">
                  {data.items.map((item) => (
                    <li key={item.id}>
                      <Button
                        variant="ghost"
                        data-testid={`trash-record-${item.id}`}
                        className="grid h-auto min-h-20 w-full grid-cols-1 justify-items-start gap-1 whitespace-normal rounded-lg px-0 py-3 text-left text-sm font-normal [overflow-wrap:anywhere] md:min-h-18 md:grid-cols-3 md:items-center md:gap-4"
                        onPress={(event) => {
                          trigger.current = event.target as HTMLElement;
                          setResult(null);
                          const url = new URL(window.location.href);
                          url.searchParams.set('image', item.id);
                          window.history.pushState(null, '', url);
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <TrashThumbnail
                            key={`${item.thumbnailPath}:${list.dataUpdatedAt}`}
                            item={item}
                          />
                          <span className="min-w-0 break-words">
                            {item.displayName}
                          </span>
                        </span>
                        <span>
                          原文件 {bytesLabel(item.byteSize)} ·{' '}
                          {item.storage.name} ·{' '}
                          {item.visibility === 'private' ? '私有' : '公开'}
                        </span>
                        <span>
                          已回收 · {processingLabels[item.processingStatus]}
                          {!item.storage.enabled ? ' · 存储停用' : ''}
                          {item.deletionStatus
                            ? item.deletionStatus === 'deleting'
                              ? ' · 正在删除'
                              : ' · 清理失败'
                            : ''}
                          <br />
                          {new Date(item.trashedAt).toLocaleString('zh-CN')}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card>
          ) : null}
          {list.isSuccess && data?.items.length === 0 ? (
            <div
              data-testid="trash-empty"
              className="grid min-h-60 content-center justify-items-center gap-3 text-center"
            >
              <Trash2 size={32} aria-hidden="true" />
              <h2 className="text-xl">
                {data.total === 0 ? '回收站为空' : '本页已无记录'}
              </h2>
              <p>回收的图片记录会显示在这里。</p>
              {page > 1 ? (
                <Button className="min-h-11" onPress={() => setPage(1)}>
                  返回第一页
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      )}
      {error ? (
        <Alert status="danger" className="my-4" data-testid="trash-error">
          <Alert.Content>
            <Alert.Title>回收记录读取失败</Alert.Title>
            <Alert.Description>{error.message}</Alert.Description>
            <Button
              variant="outline"
              className="mt-3 min-h-11"
              onPress={() => {
                void (imageId ? detail.refetch() : list.refetch());
              }}
            >
              重试加载
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
    </OwnerShell>
  );
}
