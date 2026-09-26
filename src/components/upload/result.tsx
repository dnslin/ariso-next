'use client';

import { useEffect, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { DetailCopy } from '../library/detail-copy';
import { DetailReadError, readDetail } from '../library/read-detail';
import { versionLabels } from '../library/detail-labels';

export function UploadResult({
  imageId,
  state,
  client,
  onOpen,
  onPreview,
}: {
  imageId: string;
  state: string;
  client: QueryClient;
  onOpen: (element: HTMLElement) => void;
  onPreview: (url: string | null) => void;
}) {
  const [copy, setCopy] = useState(false);
  const query = useQuery(
    {
      queryKey: ['upload-result', imageId, state],
      queryFn: ({ signal }) => readDetail(imageId, signal),
      retry: false,
      networkMode: 'always',
      refetchOnWindowFocus: true,
      refetchInterval:
        state === 'processing' || state === 'processing-queued' ? 2000 : false,
    },
    client,
  );
  const detail = query.data;
  const preview = !query.isError
    ? (detail?.versions.find((v) => v.kind === 'thumbnail')?.previewPath ??
      null)
    : null;
  useEffect(() => {
    onPreview(preview);
  }, [onPreview, preview]);
  useEffect(() => {
    if (query.error instanceof DetailReadError && query.error.status === 401) {
      client.clear();
      window.location.replace('/login?reason=expired&returnTo=%2Fupload');
    }
  }, [client, query.error]);
  return (
    <div className="grid min-w-0 gap-3 text-sm [overflow-wrap:anywhere]">
      <p>图片 ID：{imageId}</p>
      {query.isPending ? <p role="status">正在读取已保存版本与链接…</p> : null}
      {query.isError ? (
        <Alert status="danger" role="alert">
          <Alert.Content>
            <Alert.Title>图片结果读取失败</Alert.Title>
            <Alert.Description>{query.error.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {detail && !query.isError ? (
        <>
          <p>
            已保存版本：
            {detail.versions
              .filter((v) => v.saved)
              .map((v) => versionLabels[v.kind])
              .join('、') || '暂无'}
          </p>
          {detail.defaultLink.unavailableReason ? (
            <p role="status">
              默认链接暂不可用：{detail.defaultLink.unavailableReason}
            </p>
          ) : null}
          {detail.visibility === 'private' ? (
            <p>私有图片已保存；访问链接仍需所有者登录。</p>
          ) : null}
          {detail.trashedAt ? <p>图片已移入回收站，文件仍占用空间。</p> : null}
        </>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onPress={(event) => onOpen(event.target as HTMLElement)}
        >
          查看详情
        </Button>
        {query.isError ? (
          <Button
            variant="outline"
            onPress={() => {
              void query.refetch();
            }}
          >
            重试读取结果
          </Button>
        ) : null}
        {state === 'ready' && detail && !query.isError && !detail.trashedAt ? (
          <>
            <Button
              variant="outline"
              onPress={() => {
                setCopy(true);
                void query.refetch();
              }}
            >
              复制链接
            </Button>
            {detail.defaultLink.links ? (
              <Link
                href={detail.defaultLink.links.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-4"
              >
                打开图片
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
      {copy && detail ? (
        <DetailCopy
          detail={detail}
          pending={query.isFetching}
          error={query.error?.message ?? null}
          onClose={() => setCopy(false)}
          onRetry={() => {
            void query.refetch();
          }}
          closeLabel="返回上传结果"
        />
      ) : null}
    </div>
  );
}
