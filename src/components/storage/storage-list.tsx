'use client';

import { ComponentEntrance } from '../component-entrance';
import { useEffect, useState, type ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { Link } from '@heroui/react/link';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { Select } from '@heroui/react/select';
import {
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Cloud,
  HardDrive,
  Plus,
  Settings2,
} from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { StorageUnavailableView } from './storage-unavailable-view';
import { useResetUpload } from '../upload/provider';
import { readUploadReturn, uploadStorageHref } from '../upload/context';
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
  const params = useSearchParams();
  const uploadReturn = readUploadReturn(params?.get('uploadReturn'));
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
  const status = (row: StorageSummary) => (
    <>
      <Chip
        size="sm"
        color={
          row.id === defaultId && !row.enabled
            ? 'warning'
            : row.enabled
              ? 'success'
              : 'default'
        }
        className="rounded-md"
      >
        <Chip.Label>
          {row.id === defaultId && !row.enabled
            ? '默认存储已停用'
            : row.enabled
              ? '已启用'
              : '已停用'}
        </Chip.Label>
      </Chip>
      {row.id === defaultId && row.enabled ? (
        <Chip size="sm" className="rounded-md">
          <Chip.Label>默认</Chip.Label>
        </Chip>
      ) : null}
    </>
  );
  const configure = (row: StorageSummary) => (
    <Link
      href={uploadStorageHref(
        `/settings/storage/${encodeURIComponent(row.id)}`,
        uploadReturn,
      )}
      className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm no-underline"
      aria-label={`配置 ${row.name}`}
    >
      <Settings2 size={16} aria-hidden />
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
        uploadReturn={uploadReturn}
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
        <ComponentEntrance
          as="header"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <h1 className="text-[30px] font-medium leading-normal">存储</h1>
          <div className="flex flex-wrap items-center gap-2">
            {uploadReturn ? (
              <Link
                href={uploadReturn}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-foreground no-underline"
              >
                <ArrowLeft size={18} aria-hidden />
                返回上传
              </Link>
            ) : null}
            <Link
              href={uploadStorageHref('/settings/storage/new', uploadReturn)}
              data-testid="storage-create"
              className="flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm text-accent-foreground no-underline"
            >
              <Plus size={16} aria-hidden />
              添加存储
            </Link>
          </div>
        </ComponentEntrance>
        {loading ? null : error ? (
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
          <section aria-label="存储配置" className="grid">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted">{count} 项存储</span>
              <Link
                href="/analytics?view=usage"
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm no-underline"
              >
                <HardDrive size={16} aria-hidden />
                存储占用
                <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
            {visible.map((row, index) => (
              <ComponentEntrance
                as="article"
                delay={Math.min(index + 1, 3) * 0.055}
                key={row.id}
                data-storage-id={row.id}
                className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-4 border-b border-border py-5 min-[768px]:grid-cols-[24px_minmax(0,1fr)_auto] min-[768px]:items-center"
              >
                {row.type === 'local' ? (
                  <HardDrive size={20} className="mt-1" aria-hidden />
                ) : (
                  <Cloud size={20} className="mt-1" aria-hidden />
                )}
                <div className="grid min-w-0 gap-2 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-medium">{row.name}</h2>
                    {status(row)}
                  </div>
                  <p className="text-sm text-muted">{usageLabel(row)}</p>
                </div>
                <div className="col-start-2 justify-self-start min-[768px]:col-start-auto min-[768px]:justify-self-end">
                  {configure(row)}
                </div>
              </ComponentEntrance>
            ))}
          </section>
        )}
      </section>
    </OwnerShell>
  );
}
