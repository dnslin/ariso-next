'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { Select } from '@heroui/react/select';
import { Skeleton } from '@heroui/react/skeleton';
import { Table } from '@heroui/react/table';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { StorageUnavailableView } from './storage-unavailable-view';
import { useResetUpload } from '../upload/provider';
import {
  storageRequest,
  storageSettingsUrl,
  StorageRequestError,
  type StorageSettings,
  type StorageSummary,
} from './storage-api';

function usageLabel(storage: StorageSummary) {
  const type = storage.type === 'local' ? '本地' : 'S3';
  if (!storage.usage) return `${type} · 占用未读取`;
  const { knownBytes, unconfirmedObjects } = storage.usage;
  const bytes =
    knownBytes >= 1024 ** 3
      ? `${(knownBytes / 1024 ** 3).toFixed(1)} GiB`
      : knownBytes >= 1024 ** 2
        ? `${(knownBytes / 1024 ** 2).toFixed(1)} MiB`
        : knownBytes >= 1024
          ? `${(knownBytes / 1024).toFixed(1)} KiB`
          : `${knownBytes} B`;
  return `${type} · ${bytes}${unconfirmedObjects ? `（另有 ${unconfirmedObjects} 个对象待核对）` : ''}`;
}

export function StorageList(
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>,
) {
  const [pageNumber, setPageNumber] = useState(1);
  const [showDisabledList, setShowDisabledList] = useState(false);
  const [pageSize, setPageSize] = useState(5);
  const storages = useQuery({
    queryKey: ['storage-overview'],
    queryFn: ({ signal }) =>
      storageRequest<StorageSummary[]>('/api/storages', { signal }),
    retry: false,
    networkMode: 'always',
  });
  const settings = useQuery({
    queryKey: ['storage-settings'],
    queryFn: ({ signal }) =>
      storageRequest<StorageSettings>(storageSettingsUrl, { signal }),
    retry: false,
    networkMode: 'always',
  });
  const loading = storages.isPending || settings.isPending;
  const error = storages.error ?? settings.error;
  const resetUpload = useResetUpload();
  const expired = error instanceof StorageRequestError && error.status === 401;
  useEffect(() => {
    if (!expired) return;
    resetUpload();
    window.location.replace(
      '/login?reason=expired&returnTo=%2Fsettings%2Fstorage',
    );
  }, [expired, resetUpload]);
  const rows = error ? undefined : storages.data;
  const count = rows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(pageNumber, pageCount);
  const visible = rows?.slice((page - 1) * pageSize, page * pageSize) ?? [];
  const defaultId = settings.data?.defaultStorageId;
  const status = (row: StorageSummary) =>
    row.id === defaultId && !row.enabled
      ? '默认存储已停用'
      : `${row.id === defaultId ? '默认 · ' : ''}${row.enabled ? '已启用' : '已停用'}`;
  const configure = (row: StorageSummary) => (
    <Link
      href={`/settings/storage/${encodeURIComponent(row.id)}`}
      className="flex h-11 w-18 items-center justify-center rounded-xl border border-border text-sm no-underline min-[1200px]:w-22"
      aria-label={`配置 ${row.name}`}
    >
      配置
    </Link>
  );
  const empty = !loading && !error && count === 0;
  const footer =
    rows && count > 0 ? (
      <Pagination
        aria-label="存储分页"
        className="w-full flex-col items-start gap-2 min-[1200px]:flex-row min-[1200px]:items-center min-[1200px]:justify-between"
      >
        <Pagination.Summary className="self-start text-[13px]">
          共 {count} 项 · 第 {(page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, count)} 项
        </Pagination.Summary>
        <div className="flex items-center gap-1.5">
          <Select
            aria-label="每页存储数量"
            value={String(pageSize)}
            onChange={(value) => {
              setPageSize(Number(value));
              setPageNumber(1);
            }}
            className="w-[126px]"
          >
            <Select.Trigger className="h-11 rounded-xl border border-border bg-background px-2 text-sm">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[5, 10, 20].map((size) => (
                  <ListBox.Item
                    key={size}
                    id={String(size)}
                    textValue={`${size} 条 / 页`}
                  >
                    {size} 条 / 页<ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Pagination.Content className="gap-1.5">
            <Pagination.Item>
              <Pagination.Previous
                aria-label="上一页"
                isDisabled={page === 1}
                onPress={() => setPageNumber(page - 1)}
                className="size-11 rounded-xl border border-border bg-background"
              >
                <ChevronLeft size={16} />
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Link
                isActive
                className="size-11 rounded-xl bg-accent text-accent-foreground data-[active=true]:[--pagination-link-bg:var(--accent)] data-[active=true]:[--pagination-link-bg-hover:var(--accent)] data-[active=true]:[--pagination-link-bg-pressed:var(--accent)]"
                aria-label={`当前第 ${page} 页`}
              >
                {page}
              </Pagination.Link>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next
                aria-label="下一页"
                isDisabled={page === pageCount}
                onPress={() => setPageNumber(page + 1)}
                className="size-11 rounded-xl border border-border bg-background"
              >
                <ChevronRight size={16} />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </div>
      </Pagination>
    ) : undefined;
  if (
    rows &&
    settings.data &&
    (empty || (!showDisabledList && rows.every((row) => !row.enabled)))
  )
    return (
      <StorageUnavailableView
        shell={shell}
        storages={rows}
        defaultStorageId={settings.data.defaultStorageId}
        onReturn={() => setShowDisabledList(true)}
      />
    );
  return (
    <OwnerShell {...shell} footer={footer}>
      <section
        data-testid="storage-list"
        data-state={
          loading ? 'loading' : error ? 'error' : empty ? 'empty' : 'ready'
        }
        className="grid gap-5 pb-10 min-[1200px]:gap-6"
      >
        <div className="flex flex-col items-start justify-between gap-3 min-[1200px]:min-h-[76px] min-[1200px]:flex-row">
          <div className="grid gap-1.5">
            <h1 className="text-[30px] font-medium leading-normal">存储管理</h1>
            <p className="text-sm leading-normal">
              连接本地与 S3 存储，清楚掌握每一处空间。
            </p>
          </div>
          <Link
            href="/settings/storage/new"
            data-testid="storage-create"
            className="flex h-11 w-36 items-center justify-center gap-1 rounded-lg bg-accent text-sm text-accent-foreground no-underline"
          >
            <Plus size={16} aria-hidden />
            添加存储
          </Link>
        </div>
        {loading ? (
          <div role="status" aria-label="正在读取存储" className="grid gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : error ? (
          <Alert role="alert" status="danger">
            <Alert.Content>
              <Alert.Title>无法读取存储配置</Alert.Title>
              <Alert.Description>{error.message}</Alert.Description>
              <Button
                variant="outline"
                className="mt-3 min-h-11"
                onPress={() => {
                  void storages.refetch();
                  void settings.refetch();
                }}
              >
                重新加载
              </Button>
            </Alert.Content>
          </Alert>
        ) : (
          <>
            <Card className="gap-0 rounded-[20px] border border-border bg-background px-4 py-5 shadow-none min-[1200px]:p-6">
              <h2 className="text-lg font-medium leading-normal">
                存储管理 · {count} 项
              </h2>
              <Table
                variant="secondary"
                className="hidden rounded-none border-0 bg-transparent shadow-none min-[1200px]:block [&_[data-slot=table-header]]:bg-transparent [&_[data-slot=table-column]]:rounded-none [&_[data-slot=table-column]]:bg-transparent [&_[data-slot=table-column]]:after:hidden [&_[data-slot=table-cell]]:rounded-none [&_[data-slot=table-cell]]:border-b [&_[data-slot=table-cell]]:border-border! [&_[data-slot=table-cell]]:bg-transparent [&_[data-slot=table-row]]:bg-transparent"
              >
                <Table.Content
                  aria-label="存储配置"
                  className="w-full table-fixed"
                >
                  <Table.Header>
                    <Table.Column
                      isRowHeader
                      className="h-[52px] w-[36%] bg-transparent px-0 text-xs font-normal"
                    >
                      存储位置
                    </Table.Column>
                    <Table.Column className="w-[24%] bg-transparent px-0 text-xs font-normal">
                      类型与占用
                    </Table.Column>
                    <Table.Column className="w-[18%] bg-transparent px-0 text-xs font-normal">
                      状态
                    </Table.Column>
                    <Table.Column className="w-[22%] bg-transparent px-0 text-xs font-normal">
                      操作
                    </Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {visible.map((row) => (
                      <Table.Row
                        key={row.id}
                        id={row.id}
                        className="h-20 border-b border-border"
                      >
                        <Table.Cell className="px-0 pr-4 text-sm [overflow-wrap:anywhere]">
                          {row.name}
                        </Table.Cell>
                        <Table.Cell className="px-0 pr-4 text-[13px] [overflow-wrap:anywhere]">
                          {usageLabel(row)}
                        </Table.Cell>
                        <Table.Cell className="px-0 text-[13px] text-muted">
                          {status(row)}
                        </Table.Cell>
                        <Table.Cell className="px-0">
                          {configure(row)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table>
              <div className="min-[1200px]:hidden">
                {visible.map((row) => (
                  <article
                    key={row.id}
                    data-storage-id={row.id}
                    className="flex items-center gap-3 border-b border-border py-4"
                  >
                    <div className="grid min-w-0 flex-1 gap-1 leading-normal [overflow-wrap:anywhere]">
                      <h3 className="text-sm">{row.name}</h3>
                      <p className="text-[13px]">{usageLabel(row)}</p>
                      <p className="text-[13px] text-muted">{status(row)}</p>
                    </div>
                    {configure(row)}
                  </article>
                ))}
              </div>
            </Card>
            <p className="text-[13px] leading-normal">
              停用后文件仍保留，访问与上传不可用；存在图片、任务或清理引用时不能删除存储。
            </p>
          </>
        )}
      </section>
    </OwnerShell>
  );
}
