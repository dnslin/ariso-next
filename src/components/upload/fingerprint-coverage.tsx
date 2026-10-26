'use client';

import { useEffect, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Accordion } from '@heroui/react/accordion';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { ProgressBar } from '@heroui/react/progress-bar';
import { useResetUpload } from './provider';
import { DetailReadError } from '../library/read-detail';

export type FingerprintCoverage = {
  total: number;
  completed: number;
  pending: number;
  running: number;
  failed: number;
  unavailable: number;
  complete: boolean;
  failures: { imageId: string; displayName: string; message: string }[];
};

export async function requestFingerprintCoverage(
  signal?: AbortSignal,
  retry = false,
): Promise<FingerprintCoverage> {
  const response = await fetch('/api/uploads/fingerprints', {
    method: retry ? 'POST' : 'GET',
    cache: 'no-store',
    signal,
  });
  const body = await response.json();
  if (!response.ok)
    throw new DetailReadError(
      `${body.message}（HTTP ${response.status}）`,
      response.status,
    );
  return body;
}

export function UploadFingerprintCoverage({
  client,
  paused,
}: {
  client: QueryClient;
  paused: boolean;
}) {
  const resetUpload = useResetUpload();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<Error | null>(null);
  const query = useQuery(
    {
      queryKey: ['upload-fingerprint-coverage'],
      queryFn: ({ signal }) => requestFingerprintCoverage(signal),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: (query) =>
        !query.state.data?.complete && !query.state.error && !paused
          ? 5000
          : false,
    },
    client,
  );
  useEffect(() => {
    if (
      [query.error, retryError].some(
        (error) => error instanceof DetailReadError && error.status === 401,
      )
    ) {
      resetUpload();
      client.clear();
      window.location.replace(
        `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    }
  }, [client, query.error, resetUpload, retryError]);
  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await client.cancelQueries({ queryKey: ['upload-fingerprint-coverage'] });
      const coverage = await requestFingerprintCoverage(undefined, true);
      client.setQueryData(['upload-fingerprint-coverage'], coverage);
    } catch (error) {
      setRetryError(error instanceof Error ? error : new Error(String(error)));
      // Read the actual progress if the retry response was lost; never repeat the write.
      await query.refetch();
    } finally {
      setRetrying(false);
    }
  }
  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted">
        正在读取重复检测覆盖情况…
      </p>
    );
  if (query.isError)
    return (
      <Alert status="warning">
        <Alert.Content>
          <Alert.Title>重复检测覆盖情况读取失败</Alert.Title>
          <Alert.Description>{query.error.message}</Alert.Description>
          <Button
            variant="outline"
            className="mt-3 min-h-11"
            onPress={() => void query.refetch()}
          >
            重试读取
          </Button>
        </Alert.Content>
      </Alert>
    );
  if (query.data.complete && !retryError) return null;
  const coverage = query.data;
  return (
    <Alert status="warning" data-testid="upload-fingerprint-coverage">
      <Alert.Content className="min-w-0">
        <Alert.Title>
          {coverage.pending || coverage.running
            ? '正在补齐旧图片的重复检测信息'
            : '旧图片重复检测尚未完成'}
        </Alert.Title>
        <Alert.Description className="grid gap-2">
          <p>
            已完成 {coverage.completed} / {coverage.total} 张 · 待处理{' '}
            {coverage.pending} 张 · 处理中 {coverage.running} 张 · 失败{' '}
            {coverage.failed} 张
            {coverage.unavailable
              ? ` · 存储停用 ${coverage.unavailable} 张`
              : ''}
          </p>
          <p>未检查的旧图暂不能保证识别重复。新上传会立即检查。</p>
          <ProgressBar
            aria-label="旧图片重复检测覆盖进度"
            value={coverage.completed}
            maxValue={Math.max(coverage.total, 1)}
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          {paused ? <p>备份期间暂停补齐，结束后继续。</p> : null}
          {coverage.unavailable ? <p>启用对应存储后继续补齐。</p> : null}
          {coverage.failures.length ? (
            <Accordion className="min-w-0" defaultExpandedKeys={['failures']}>
              <Accordion.Item id="failures">
                <Accordion.Heading>
                  <Accordion.Trigger className="min-h-11 py-2 text-sm">
                    查看未完成原因
                    {coverage.failed + coverage.unavailable >
                    coverage.failures.length
                      ? `（前 ${coverage.failures.length} 条）`
                      : ''}
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="pb-2 [overflow-wrap:anywhere]">
                    <ul className="grid gap-2">
                      {coverage.failures.map((failure) => (
                        <li key={failure.imageId}>
                          {failure.displayName}：{failure.message}
                        </li>
                      ))}
                    </ul>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          ) : null}
          {retryError ? (
            <p role="alert">
              补齐重试结果未确认：{retryError.message}。请先核对当前进度。
            </p>
          ) : null}
        </Alert.Description>
        {coverage.failed ? (
          <Button
            variant="outline"
            className="mt-3 min-h-11"
            isPending={retrying}
            isDisabled={paused || retrying}
            onPress={() => void retry()}
          >
            重试失败项
          </Button>
        ) : null}
      </Alert.Content>
    </Alert>
  );
}
