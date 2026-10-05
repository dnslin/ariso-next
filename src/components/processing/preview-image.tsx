'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import { Link } from '@heroui/react/link';
import { ProcessingRequestError } from './api';

export function PreviewImage({
  url,
  name,
  onExpire,
  onRefresh,
}: {
  url: string;
  name: string;
  onExpire: () => void;
  onRefresh: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const query = useQuery({
    queryKey: ['media-preview-bytes', url],
    retry: false,
    gcTime: 0,
    networkMode: 'always',
    queryFn: async ({ signal }) => {
      const response = await fetch(url, { signal, cache: 'no-store' });
      if (!response.ok)
        throw new ProcessingRequestError(
          response.status,
          await response.json(),
        );
      return response.blob();
    },
  });
  useEffect(() => {
    if (!query.data || !image.current || unsupported) return;
    const objectUrl = URL.createObjectURL(query.data);
    image.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data, unsupported]);
  const sessionLost =
    query.error instanceof ProcessingRequestError && query.error.status === 401;
  const resultExpired =
    query.error instanceof ProcessingRequestError && query.error.status === 410;
  useEffect(() => {
    if (sessionLost) onExpire();
  }, [sessionLost, onExpire]);
  useEffect(() => {
    if (resultExpired) onRefresh();
  }, [resultExpired, onRefresh]);
  if (query.error)
    return (
      <div className="grid gap-3 p-5 text-sm">
        <p role="alert">
          {resultExpired
            ? '结果已到期，请重新生成预览。'
            : `无法读取预览结果：${query.error.message}`}
        </p>
        {!resultExpired && !sessionLost ? (
          <Button
            variant="outline"
            className="min-h-11 w-fit rounded-xl"
            onPress={() => void query.refetch()}
          >
            重新读取结果
          </Button>
        ) : null}
      </div>
    );
  if (!query.data)
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 p-8 text-sm"
      >
        <Spinner size="sm" />
        正在读取真实结果…
      </p>
    );
  if (unsupported)
    return (
      <div className="grid gap-3 p-5 text-sm">
        <p>
          当前浏览器无法直接显示这个原图格式。可读取原文件，或明确选择缩略图重新预览。
        </p>
        <Link
          href={url}
          download
          className="flex min-h-11 w-fit items-center rounded-xl border border-border px-4 text-foreground no-underline"
        >
          读取原文件
        </Link>
      </div>
    );
  // Private bytes come from the authenticated result API; revoke this URL when the result leaves the page.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      alt={`${name}的真实处理预览`}
      onError={() => setUnsupported(true)}
      className="max-h-[480px] max-w-full object-contain"
    />
  );
}
