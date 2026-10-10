'use client';

import { useCallback, useEffect, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { Spinner } from '@heroui/react/spinner';
import { Alert } from '@heroui/react/alert';
import { Link as LinkIcon, Search } from 'lucide-react';
import { OwnerShell } from '../../components/shell/owner-shell';
import { useResetUpload } from '../../components/upload/provider';
import { shareRequest, ShareRequestError } from './api';
import { SharesList, type SharePage } from './list';

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
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);
  const expire = useCallback(() => {
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }, [resetUpload, client]);
  const list = useQuery(
    {
      queryKey: ['shares', q, page, pageSize],
      queryFn: ({ signal }) =>
        shareRequest<SharePage>(
          `/api/shares?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`,
          { signal },
        ),
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (list.error instanceof ShareRequestError && list.error.status === 401)
      expire();
  }, [list.error, expire]);
  const data = !list.isError ? list.data : undefined;
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  return (
    <OwnerShell
      {...props}
      onSessionExpire={expire}
      footer={
        list.isError ? (
          <Button
            className="h-12 w-full rounded-lg font-normal md:w-50"
            isDisabled={list.isFetching}
            onPress={() => void list.refetch()}
          >
            重新加载
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
                    setPageSize(Number(value));
                    setPage(1);
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
                      onPress={() => setPage(page - 1)}
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
                      onPress={() => setPage(page + 1)}
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
      <section data-testid="shares-screen" className="grid min-w-0 gap-4">
        <h1 className="text-[26px] font-medium leading-normal md:text-[30px]">
          分享管理
        </h1>
        <p className="text-sm text-muted">
          分享相册中的公开图片，控制密码与有效期。
        </p>
        <TextField
          aria-label="搜索分享相册"
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(1);
          }}
          className="w-full min-w-0 md:max-w-120"
        >
          <InputGroup className="h-11 w-full min-w-0 rounded-lg border border-border bg-background shadow-none">
            <InputGroup.Prefix className="border-0 pr-2 text-muted">
              <Search size={16} aria-hidden />
            </InputGroup.Prefix>
            <InputGroup.Input
              placeholder="搜索分享相册…"
              className="h-11 min-w-0 py-0 text-base md:text-sm"
            />
          </InputGroup>
        </TextField>
        {data?.items.length ? (
          <SharesList
            items={data.items}
            total={data.total}
            timeZone={props.timeZone}
          />
        ) : null}
        {data?.items.length === 0 ? (
          <div
            data-testid="shares-empty"
            className="grid min-h-80 content-center justify-items-center gap-4 text-center"
          >
            <LinkIcon size={36} aria-hidden />
            <h2 className="text-xl">
              {q
                ? '没有找到分享相册'
                : data.total
                  ? '本页已无分享'
                  : '还没有分享链接'}
            </h2>
            <p className="text-sm text-muted">
              {q ? '请尝试其他相册名称。' : '从相册的“更多”中创建分享。'}
            </p>
            {page > 1 ? (
              <Button
                className="h-12 rounded-lg font-normal"
                onPress={() => setPage(1)}
              >
                返回第一页
              </Button>
            ) : !q ? (
              <Link
                href="/albums"
                className="h-12 justify-center rounded-lg bg-accent px-6 text-sm font-normal text-accent-foreground no-underline"
              >
                前往相册
              </Link>
            ) : null}
          </div>
        ) : null}
        {list.isPending ? (
          <p
            role="status"
            data-testid="shares-loading"
            className="flex items-center gap-2 py-8"
          >
            <Spinner size="sm" />
            正在读取分享…
          </p>
        ) : null}
        {list.error ? (
          <Alert status="danger" data-testid="shares-error">
            <Alert.Content>
              <Alert.Title>分享列表加载失败</Alert.Title>
              <Alert.Description>{list.error.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </section>
    </OwnerShell>
  );
}
