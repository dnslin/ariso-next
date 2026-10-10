'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { toast } from '@heroui/react/toast';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { Spinner } from '@heroui/react/spinner';
import { Alert } from '@heroui/react/alert';
import { Plus, Search, Tags } from 'lucide-react';
import { OwnerShell } from '../../components/shell/owner-shell';
import { useResetUpload } from '../../components/upload/provider';
import { parseTagQuery } from '../../server/collections/tag-query';
import { TagDialog, type TagAction } from './dialog';
import { TagsList } from './list';
import { tagRequest, TagRequestError, type TagPage } from './api';

export function TagsScreen(props: {
  name: string;
  logoUrl?: string | null;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  timeZone: string;
}) {
  const params = useSearchParams();
  const returnTo = `/tags${params.size ? `?${params}` : ''}`;
  let query: ReturnType<typeof parseTagQuery> | null = null;
  let queryError: Error | null = null;
  try {
    query = parseTagQuery(new URLSearchParams(params));
  } catch (error) {
    queryError = error instanceof Error ? error : new Error('标签查询无效');
  }
  const { q = '', page = 1, pageSize = 40 } = query ?? {};
  const [client] = useState(() => new QueryClient());
  const resetUpload = useResetUpload();
  const [action, setAction] = useState<TagAction | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const expire = useCallback(() => {
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [resetUpload, client, returnTo]);
  const list = useQuery(
    {
      queryKey: ['tags', q, page, pageSize],
      queryFn: ({ signal }) =>
        tagRequest<TagPage>(
          `/api/tags?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`,
          { signal },
        ),
      enabled: !!query,
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (list.error instanceof TagRequestError && list.error.status === 401)
      expire();
  }, [list.error, expire]);
  const data = query && !list.isError ? list.data : undefined;
  const error = queryError ?? list.error;
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  function apply(
    patch: Partial<{ q: string; page: number; pageSize: number }>,
  ) {
    const next = { q, page, pageSize, ...patch };
    const search = new URLSearchParams();
    if (next.q) search.set('q', next.q);
    if (next.page !== 1) search.set('page', String(next.page));
    if (next.pageSize !== 40) search.set('pageSize', String(next.pageSize));
    window.history.pushState(
      null,
      '',
      `/tags${search.size ? `?${search}` : ''}`,
    );
  }
  function close() {
    setOpen(false);
    setAction(null);
    requestAnimationFrame(() => {
      const target = opener.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
      else
        document.getElementById('tags-title')?.focus({ preventScroll: true });
    });
  }
  function openAction(next: TagAction) {
    opener.current = document.activeElement as HTMLElement | null;
    setAction(next);
    setOpen(true);
  }
  const empty = data?.total === 0 && !q;
  function reload() {
    if (queryError) window.history.pushState(null, '', '/tags');
    else void list.refetch();
  }
  return (
    <OwnerShell
      {...props}
      returnTo={returnTo}
      footer={
        error ? (
          <Button
            className="h-12 w-full rounded-lg font-normal md:w-50"
            onPress={reload}
          >
            重新加载
          </Button>
        ) : !empty ? (
          <div className="grid w-full gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <p data-testid="tags-count" role="status" className="text-sm">
              {data
                ? `共 ${data.total} 项 · ${pageSize} 条 / 页 · ${page} / ${pages}`
                : '数量待确认'}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <Select
                aria-label="每页标签数"
                value={String(pageSize)}
                onChange={(value) => {
                  if (value) apply({ pageSize: Number(value), page: 1 });
                }}
                className="w-24 shrink-0"
              >
                <Select.Trigger className="h-11 rounded-lg border border-border bg-background text-sm font-normal">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {[20, 40, 80].map((size) => (
                      <ListBox.Item
                        key={size}
                        id={String(size)}
                        textValue={`${size} 条`}
                        className="min-h-11"
                      >
                        {size} 条<ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Pagination
                aria-label="标签分页"
                className="min-w-0 flex-1 md:w-65"
              >
                <Pagination.Content className="w-full gap-2 md:gap-3">
                  <Pagination.Item className="flex-1">
                    <Pagination.Previous
                      className="h-11 w-full min-w-0 rounded-lg border border-border px-2 font-normal"
                      isDisabled={page <= 1 || list.isFetching || !!error}
                      onPress={() => apply({ page: page - 1 })}
                    >
                      上一页
                    </Pagination.Previous>
                  </Pagination.Item>
                  <Pagination.Item className="flex-1">
                    <Pagination.Next
                      className="h-11 w-full min-w-0 rounded-lg border border-border px-2 font-normal"
                      isDisabled={!data || page >= pages || list.isFetching}
                      onPress={() => apply({ page: page + 1 })}
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
      <section
        className="grid min-w-0 gap-5 xl:gap-6"
        aria-labelledby="tags-title"
      >
        <div className="flex min-h-19 items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <h1
              id="tags-title"
              tabIndex={-1}
              className={`${error ? 'text-[28px]' : 'text-[30px]'} font-medium leading-normal`}
            >
              {error ? '标签加载失败' : '标签'}
            </h1>
            <p className={error ? 'text-[13px]' : 'text-sm'}>
              {error ? '暂时无法读取标签列表。' : '图片数量不含回收站。'}
            </p>
          </div>
          {!empty && !error ? (
            <Button
              className="h-11 w-36 shrink-0 gap-1 rounded-lg font-normal xl:h-9"
              onPress={() => openAction({ kind: 'create' })}
            >
              <Plus size={16} aria-hidden />
              新建标签
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p
            data-testid="tags-notice"
            role="status"
            className="rounded-lg bg-default p-3 text-[13px] whitespace-pre-wrap"
          >
            {notice}
          </p>
        ) : null}
        {!empty && !error ? (
          <TextField
            aria-label="搜索标签名称"
            value={params.get('q') ?? ''}
            onChange={(value) => apply({ q: value, page: 1 })}
          >
            <InputGroup className="h-12 w-full rounded-lg border border-border bg-field shadow-none">
              <InputGroup.Prefix className="border-0 pl-3 pr-2 text-foreground">
                <Search size={16} aria-hidden />
              </InputGroup.Prefix>
              <InputGroup.Input
                placeholder="搜索标签名称"
                className="h-full min-w-0 py-0 pl-0 pr-3 text-sm font-normal"
                style={{ fontSize: 14 }}
              />
            </InputGroup>
          </TextField>
        ) : null}
        {list.isPending && query ? (
          <p
            role="status"
            data-testid="tags-loading"
            className="flex items-center gap-2 py-8"
          >
            <Spinner size="sm" />
            正在读取标签…
          </p>
        ) : null}
        {error ? (
          <Alert
            data-testid="tags-error"
            className="rounded-lg border-0 bg-default p-3 text-foreground shadow-none"
          >
            <Alert.Content>
              <Alert.Description className="text-[13px] text-foreground">
                {error.message} 未读取到数据不表示标签已被删除。
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {data?.items.length ? (
          <TagsList
            items={data.items}
            total={data.total}
            timeZone={props.timeZone}
            disabled={list.isFetching}
            onAction={openAction}
          />
        ) : null}
        {data?.items.length === 0 ? (
          <div
            data-testid="tags-empty"
            className="grid min-h-60 content-center justify-items-center gap-4 text-center md:min-h-80"
          >
            <Tags size={36} aria-hidden />
            <h2 className="text-xl font-medium">
              {q ? '没有找到标签' : data.total ? '本页已无标签' : '还没有标签'}
            </h2>
            <p className="text-sm">
              {q
                ? '请尝试其他名称。'
                : data.total
                  ? '标签数量已变化，请返回有效页。'
                  : '为图片建立第一个标签。'}
            </p>
            {q ? (
              <Button
                className="h-12 w-full rounded-lg font-normal md:w-50"
                onPress={() => apply({ q: '', page: 1 })}
              >
                清除搜索
              </Button>
            ) : null}
            {empty ? (
              <Button
                className="h-12 w-full rounded-lg font-normal md:w-50"
                onPress={() => openAction({ kind: 'create' })}
              >
                新建标签
              </Button>
            ) : null}
            {page > 1 ? (
              <Button
                className="h-12 rounded-lg font-normal"
                onPress={() => apply({ page: 1 })}
              >
                返回第一页
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
      {action ? (
        <TagDialog
          action={action}
          isOpen={open}
          onClose={close}
          onExpire={expire}
          onRefresh={async () => {
            // 列表错误由 query 展示，不改变已经取得的目标核对结果。
            await list.refetch();
          }}
          onComplete={(message, status = 'success') => {
            if (message) {
              if (status === 'unknown') setNotice(message);
              else {
                setNotice('');
                toast.success(message);
              }
            }
            close();
            void client.invalidateQueries({ queryKey: ['tags'] });
          }}
        />
      ) : null}
    </OwnerShell>
  );
}
