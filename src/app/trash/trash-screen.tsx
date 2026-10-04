'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { toast } from '@heroui/react/toast';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Checkbox } from '@heroui/react/checkbox';
import { Link } from '@heroui/react/link';
import { Tooltip } from '@heroui/react/tooltip';
import { Spinner } from '@heroui/react/spinner';
import { SearchField } from '@heroui/react/search-field';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  BatchWorkspaceContent,
  BatchWorkspaceFooter,
} from '../../components/library/batch-workspace';
import {
  CleanupContent,
  CleanupFooter,
} from '../../components/library/cleanup-workspace';
import { useCleanup } from '../../components/library/use-cleanup';
import { useTrashBatch } from '../../components/library/use-trash-batch';
import {
  TrashBatchWorkspaceContent,
  TrashBatchWorkspaceFooter,
} from '../../components/library/trash-batch-workspace';
import { useLibraryBatch } from '../../components/library/use-library-batch';
import { LibrarySelectionMenu } from '../library/library-selection-menu';
import { useLibrarySelection } from '../library/use-library-selection';
import { useSelectionReconciliation } from '../library/use-selection-reconciliation';
import { useTrashQuery } from './use-trash-query';
import { OwnerShell } from '../../components/shell/owner-shell';
import { useResetUpload } from '../../components/upload/provider';
import { TrashAction } from '../../components/library/trash-actions';
import {
  DetailReadError,
  readDetail,
} from '../../components/library/read-detail';
import {
  bytesLabel,
  processingLabels,
} from '../../components/library/detail-labels';
import type { LibraryPage } from '../../server/library/types';
import type { LibraryDetail } from '../../server/library/detail-types';
import { TrashRecord } from './trash-record';
import { TrashThumbnail } from './trash-thumbnail';
import { TrashFilters, TrashPageSize } from './trash-filters';
import { ArrowLeft } from 'lucide-react';

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
  const resetUpload = useResetUpload();
  const params = useSearchParams();
  const imageId = params.get('image');
  const [client] = useState(() => new QueryClient());
  const [mutationPending, setMutationPending] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
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
  const triggerId = useRef<string | null>(null);
  const previousImageId = useRef(imageId);
  const list = useTrashQuery(client);
  const { page, setPage, query: trashQuery, filters: trashFilters } = list;
  const detail = useQuery(
    {
      queryKey: ['trash-detail', imageId],
      queryFn: ({ signal }) => readDetail(imageId!, signal),
      enabled: !!imageId && unavailable?.id !== imageId && !mutationPending,
      retry: false,
      networkMode: 'always',
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    client,
  );
  const error = imageId ? detail.error : list.error;
  const missing = unavailable?.id === imageId && unavailable.status === 404;
  const expired =
    unavailable?.status === 401 ||
    (error instanceof DetailReadError && error.status === 401) ||
    list.expired;
  const data = !expired ? list.data : undefined;
  const currentItems = useMemo(
    () =>
      data?.items.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        byteSize: item.byteSize,
        thumbnailUrl: item.thumbnailPath,
        storage: item.storage,
      })) ?? [],
    [data],
  );
  const selection = useLibrarySelection(trashQuery, currentItems, page);
  const clearSelection = selection.clear;
  const expireSession = useCallback(() => {
    clearSelection();
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }, [client, resetUpload, clearSelection]);
  const batch = useLibraryBatch({
    selection,
    query: trashQuery,
    onExpire: expireSession,
    onRefresh: () =>
      client.invalidateQueries({ queryKey: ['trash'] }, { throwOnError: true }),
  });
  const permanentBatch = useTrashBatch({
    selection,
    query: trashQuery,
    onExpire: expireSession,
    onRefresh: () =>
      client.invalidateQueries({ queryKey: ['trash'] }, { throwOnError: true }),
  });
  const reconciliation = useSelectionReconciliation({
    selection,
    identity: trashQuery,
    filters: trashFilters,
    dataUpdatedAt: list.dataUpdatedAt,
    enabled:
      !!trashFilters &&
      !batch.pending &&
      !batch.unresolved &&
      !permanentBatch.pending &&
      !permanentBatch.unresolved,
    onSessionExpired: expireSession,
    onInvalid: (ids) => {
      if (ids.length)
        toast.warning('已更新选择', {
          description: `${ids.length} 条记录已删除或离开回收站，已移除选择。`,
        });
    },
  });
  const selectionDisabled =
    list.isFetching ||
    batch.pending ||
    batch.unresolved ||
    permanentBatch.pending ||
    permanentBatch.unresolved ||
    reconciliation.pending ||
    !!reconciliation.error;
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (expired) expireSession();
  }, [expired, expireSession]);
  useEffect(() => {
    const returningFromRecord = previousImageId.current !== null && !imageId;
    previousImageId.current = imageId;
    if (!imageId && !returningFromRecord) return;
    const target = imageId
      ? document.getElementById('trash-record-title')
      : (document.getElementById(`trash-record-${triggerId.current}`) ??
        document.getElementById('trash-title'));
    target?.focus({ preventScroll: true });
  }, [imageId, detail.isSuccess]);

  function openRecord(id: string) {
    triggerId.current = id;
    setResult(null);
    const url = new URL(window.location.href);
    url.searchParams.set('image', id);
    window.history.pushState(null, '', url);
  }
  function closeRecord() {
    const url = new URL(window.location.href);
    url.searchParams.delete('image');
    window.history.replaceState(null, '', url);
  }
  function restored(record: LibraryDetail) {
    selection.remove(record.id);
    setResult(record);
    if (record.storage.enabled)
      toast.success('记录已恢复', { description: record.displayName });
    client.setQueriesData<LibraryPage>({ queryKey: ['trash'] }, (data) =>
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
  const cleanup = useCleanup({
    record,
    onExpire: expireSession,
    onRefresh: () =>
      client.invalidateQueries({ queryKey: ['trash'] }, { throwOnError: true }),
  });
  useEffect(() => {
    const task = cleanup.task;
    if (!task || task.status === 'succeeded') return;
    client.setQueryData<LibraryDetail>(
      ['trash-detail', task.imageId],
      (current) =>
        current
          ? {
              ...current,
              deletionStatus:
                task.status === 'failed' ? 'cleanup_failed' : 'deleting',
              versions: current.versions.map((version) => ({
                ...version,
                previewPath: null,
                unavailableReason: '图片已进入永久删除，内容不可访问。',
              })),
            }
          : current,
    );
  }, [client, cleanup.task]);
  function leaveCleanup() {
    cleanup.close();
    if (!cleanup.confirmation) closeRecord();
  }
  const pages = data
    ? Math.max(1, Math.ceil(data.total / (trashFilters?.pageSize ?? 40)))
    : null;
  return (
    <OwnerShell
      name={name}
      description={description}
      email={email}
      ownerName={ownerName}
      initialSidebarCollapsed={initialSidebarCollapsed}
      returnTo={`/trash${params.toString() ? `?${params.toString()}` : ''}`}
      footer={
        permanentBatch.visible ? (
          <TrashBatchWorkspaceFooter batch={permanentBatch} />
        ) : batch.visible ? (
          <BatchWorkspaceFooter batch={batch} />
        ) : imageId && cleanup.visible && !cleanup.confirmation ? (
          <CleanupFooter cleanup={cleanup} onBack={leaveCleanup} />
        ) : imageId ? (
          <div className="flex w-full items-end gap-3 md:justify-end [&>div]:flex-1 md:[&>div]:max-w-60">
            {record ? (
              <>
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-lg md:w-50 md:flex-none"
                  isDisabled={mutationPending}
                  onPress={(event) => cleanup.open(event.target as HTMLElement)}
                >
                  {record.deletionStatus ? '查看清理状态' : '永久删除'}
                </Button>
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
              </>
            ) : null}
          </div>
        ) : (
          <div className="grid w-full gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex min-w-0 items-center justify-between gap-3 md:justify-start">
              <p
                data-testid="trash-count"
                role="status"
                className="text-[13px]"
              >
                {data ? `共 ${data.total} 项` : '数量待确认'}
              </p>
              {trashFilters ? (
                <div className="flex shrink-0 items-center gap-2 text-[13px]">
                  <span>每页</span>
                  <TrashPageSize
                    value={trashFilters.pageSize}
                    disabled={selectionDisabled}
                    onChange={(pageSize) => void list.applyQuery({ pageSize })}
                  />
                  <span>条</span>
                </div>
              ) : null}
            </div>
            <div className="flex gap-3">
              <span className="flex items-center text-[13px]">
                {page} / {pages ?? '—'}
              </span>
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-lg md:w-30"
                isDisabled={page === 1 || list.isFetching}
                onPress={() => setPage(page - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-lg md:w-30"
                isDisabled={!data?.hasMore || list.isFetching}
                onPress={() => setPage(page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        )
      }
    >
      {permanentBatch.visible ? (
        <TrashBatchWorkspaceContent batch={permanentBatch} />
      ) : batch.visible ? (
        <BatchWorkspaceContent batch={batch} client={client} />
      ) : imageId ? (
        <>
          {!record ? (
            <Button
              variant="outline"
              className="mb-5 min-h-11 rounded-lg"
              aria-label="返回回收站列表"
              onPress={closeRecord}
            >
              <ArrowLeft size={16} aria-hidden />
              返回
            </Button>
          ) : null}
          {missing ? (
            <p role="alert">图片记录已不存在，无法恢复。请返回回收站。</p>
          ) : null}
          {detail.isPending ? (
            <p role="status">
              <Spinner size="sm" />
              正在读取回收记录…
            </p>
          ) : null}
          {record && !(cleanup.visible && !cleanup.confirmation) ? (
            <TrashRecord record={record} onBack={closeRecord} />
          ) : null}
          <CleanupContent cleanup={cleanup} onBack={leaveCleanup} />
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
          <p className="text-[13px]">
            {data ? `${data.total} 条记录 · ` : ''}
            文件仍占用空间，不会自动清理。
          </p>
          <div
            data-testid="library-toolbar"
            className="flex min-w-0 items-center gap-3"
          >
            <TrashSearch
              key={trashFilters?.q ?? ''}
              value={trashFilters?.q ?? ''}
              onSubmit={(q) => void list.applyQuery({ q })}
            />
            {selection.selected.size ? (
              <LibrarySelectionMenu
                scope="trash"
                selection={selection}
                loadingMode="pages"
                disabled={selectionDisabled}
                onOpen={(id) => openRecord(id)}
                onBatch={(_action, element) => batch.open('restore', element)}
                onPermanentDelete={permanentBatch.open}
              />
            ) : (
              <Button
                variant="outline"
                className="h-12 w-26 shrink-0 rounded-lg text-sm font-normal md:w-40"
                isDisabled={!currentItems.length || selectionDisabled}
                onPress={() => setSelectionMode((value) => !value)}
              >
                {selectionMode ? '取消选择' : '选择记录'}
              </Button>
            )}
          </div>
          {trashFilters ? (
            <TrashFilters
              filters={trashFilters}
              client={client}
              disabled={selectionDisabled}
              onApply={(patch) => void list.applyQuery(patch)}
              onSessionExpired={expireSession}
            />
          ) : null}
          {selectionMode || selection.selected.size ? (
            <div
              data-testid="trash-selection"
              className="flex min-w-0 items-center justify-between gap-3"
            >
              <Checkbox
                data-testid="trash-select-page"
                aria-label="全选当前页回收记录"
                isSelected={
                  !!currentItems.length &&
                  selection.currentCount === currentItems.length
                }
                isIndeterminate={
                  selection.currentCount > 0 &&
                  selection.currentCount < currentItems.length
                }
                isDisabled={!currentItems.length || selectionDisabled}
                onChange={(selected) =>
                  selected
                    ? selection.selectCurrent()
                    : selection.deselectCurrent()
                }
              >
                <Checkbox.Content className="flex min-h-11 items-center gap-2">
                  <Checkbox.Control className="size-5 border border-border bg-surface">
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <span className="text-sm">全选当前页</span>
                </Checkbox.Content>
              </Checkbox>
            </div>
          ) : null}
          {permanentBatch.workspace?.phase === 'result' ? (
            <Button
              variant="outline"
              className="min-h-11 w-fit rounded-lg"
              onPress={permanentBatch.reopen}
            >
              {permanentBatch.unresolved
                ? '查看待核对结果'
                : '查看本次清理结果'}
            </Button>
          ) : null}
          {batch.unresolved ? (
            <Alert status="warning">
              <Alert.Content>
                <Alert.Title>恢复结果待核对</Alert.Title>
                <Alert.Description>
                  尚未确认的记录会保留选择，请先核对本次操作。
                </Alert.Description>
                <Button className="mt-3 min-h-11" onPress={batch.reopen}>
                  核对本次结果
                </Button>
              </Alert.Content>
            </Alert>
          ) : null}
          {reconciliation.error ? (
            <Alert status="danger">
              <Alert.Content>
                <Alert.Title>已选记录核对失败</Alert.Title>
                <Alert.Description>{reconciliation.error}</Alert.Description>
                <Button
                  className="mt-3 min-h-11"
                  onPress={reconciliation.retry}
                >
                  重试核对
                </Button>
              </Alert.Content>
            </Alert>
          ) : null}
          {result && !result.storage.enabled ? (
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
          {list.isPending ? (
            <p role="status">
              <Spinner size="sm" />
              正在读取回收记录…
            </p>
          ) : null}
          {data?.items.length ? (
            <Card className="gap-0 rounded-2xl border border-border bg-background px-3 py-2 shadow-none md:px-5 dark:bg-surface">
              <Card.Content className="p-0">
                <ul data-testid="trash-list">
                  {data.items.map((item) => (
                    <li
                      key={item.id}
                      data-selected={
                        selection.selected.has(item.id) || undefined
                      }
                      className="flex min-w-0 items-start gap-2 md:items-center"
                    >
                      {selectionMode || selection.selected.size ? (
                        <Checkbox
                          aria-label={`选择回收图片：${item.displayName}`}
                          isSelected={selection.selected.has(item.id)}
                          isDisabled={selectionDisabled}
                          onChange={() =>
                            selection.toggle({
                              id: item.id,
                              displayName: item.displayName,
                              byteSize: item.byteSize,
                              thumbnailUrl: item.thumbnailPath,
                              storage: item.storage,
                            })
                          }
                          className="mt-3 shrink-0 md:mt-0"
                        >
                          <Checkbox.Content className="flex size-11 items-center justify-center">
                            <Checkbox.Control className="size-5 border border-border bg-surface">
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox.Content>
                        </Checkbox>
                      ) : null}
                      <Button
                        variant="ghost"
                        data-testid={`trash-record-${item.id}`}
                        id={`trash-record-${item.id}`}
                        isDisabled={
                          batch.pending ||
                          batch.unresolved ||
                          permanentBatch.pending ||
                          permanentBatch.unresolved
                        }
                        className="grid h-auto min-h-26! min-w-0 flex-1 grid-cols-1 items-start justify-items-start whitespace-normal rounded-lg px-0 py-0 text-left text-sm font-normal leading-[22px] [overflow-wrap:anywhere] md:min-h-18! md:grid-cols-3 md:items-center md:gap-3 md:py-1 xl:grid-cols-[334px_minmax(0,1fr)_minmax(0,1fr)]"
                        onPress={() => openRecord(item.id)}
                      >
                        <span className="flex min-w-0 items-start gap-3 md:items-center">
                          <TrashThumbnail
                            key={`${item.thumbnailPath}:${list.dataUpdatedAt}`}
                            item={item}
                          />
                          <span className="min-w-0 break-words">
                            <span className="block">{item.displayName}</span>
                            <span className="block md:hidden">
                              原文件 {bytesLabel(item.byteSize)} ·{' '}
                              {item.storage.name} ·{' '}
                              {item.visibility === 'private' ? '私有' : '公开'}{' '}
                              · 已回收 ·{' '}
                              {processingLabels[item.processingStatus]}
                              {!item.storage.enabled ? ' · 存储停用' : ''}
                              {item.deletionStatus
                                ? item.deletionStatus === 'deleting'
                                  ? ' · 正在删除'
                                  : ' · 清理失败'
                                : ''}
                              <span className="block">
                                {new Date(item.trashedAt).toLocaleString(
                                  'zh-CN',
                                )}
                              </span>
                            </span>
                          </span>
                        </span>
                        <span className="hidden md:block">
                          原文件 {bytesLabel(item.byteSize)} ·{' '}
                          {item.storage.name} ·{' '}
                          {item.visibility === 'private' ? '私有' : '公开'}
                        </span>
                        <span className="hidden md:block">
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
                {data.total === 0
                  ? trashFilters?.q ||
                    trashFilters?.storageId ||
                    trashFilters?.status ||
                    trashFilters?.deletionStatus
                    ? '没有匹配的回收记录'
                    : '回收站为空'
                  : '本页已无记录'}
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
                if (list.queryError) list.resetQuery();
                else void (imageId ? detail.refetch() : list.refetch());
              }}
            >
              {list.queryError ? '重置查询' : '重试加载'}
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
    </OwnerShell>
  );
}

function TrashSearch({
  value: initialValue,
  onSubmit,
}: {
  value: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <SearchField
      aria-label="搜索回收图片名称"
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      onClear={() => onSubmit('')}
      className="w-full min-w-0"
    >
      <SearchField.Group className="h-12 min-w-0 rounded-lg border border-border bg-background shadow-none">
        <SearchField.Input
          placeholder="搜索文件名称"
          className="h-12 pl-9 text-sm placeholder:text-foreground"
        />
        {value ? (
          <SearchField.ClearButton aria-label="清除搜索" className="size-12" />
        ) : null}
      </SearchField.Group>
    </SearchField>
  );
}
