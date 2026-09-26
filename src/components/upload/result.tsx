'use client';

import { useEffect } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { DetailReadError, readDetail } from '../library/read-detail';

export function useUploadResult(
  imageId: string | undefined,
  state: string,
  client: QueryClient,
  mutationPending: boolean,
) {
  const query = useQuery(
    {
      queryKey: ['upload-result', imageId, state],
      queryFn: ({ signal }) => readDetail(imageId!, signal),
      enabled: !!imageId && !mutationPending,
      retry: false,
      networkMode: 'always',
      refetchOnWindowFocus: true,
      refetchInterval:
        state === 'processing' || state === 'processing-queued' ? 2000 : false,
    },
    client,
  );
  useEffect(() => {
    if (query.error instanceof DetailReadError && query.error.status === 401) {
      client.clear();
      window.location.replace('/login?reason=expired&returnTo=%2Fupload');
    }
  }, [client, query.error]);
  return query;
}

export function UploadResult({
  query,
}: {
  query: ReturnType<typeof useUploadResult>;
}) {
  if (query.isError)
    return (
      <Alert status="danger" role="alert">
        <Alert.Content>
          <Alert.Title>图片结果读取失败</Alert.Title>
          <Alert.Description>{query.error.message}</Alert.Description>
          <Button
            variant="outline"
            className="mt-3 min-h-11 rounded-lg"
            onPress={() => void query.refetch()}
          >
            重试读取结果
          </Button>
        </Alert.Content>
      </Alert>
    );
  if (query.isPending)
    return (
      <p role="status" className="text-xs">
        正在读取已保存版本…
      </p>
    );
  if (query.data.trashedAt)
    return (
      <p role="status" className="text-xs">
        图片已移入回收站，文件仍占用空间。
      </p>
    );
  return null;
}
