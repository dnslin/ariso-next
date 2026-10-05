'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicShareItem } from '../../server/sharing/public-types';

const messages = {
  ready: '',
  processing: '处理中',
  failed: '暂不可用',
  disabled: '存储已停用',
  missing: '暂不可用',
};

export function ShareThumbnail({
  item,
  cover = false,
  onFailure,
}: {
  item: PublicShareItem | null;
  cover?: boolean;
  onFailure?: (imageId: string) => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const url = item?.thumbnailUrl;
  useEffect(() => {
    // Eager/cached errors can finish before React attaches the error handler.
    if (url && image.current?.complete && !image.current.naturalWidth) {
      setFailedUrl(url);
      if (item) onFailure?.(item.imageId);
    }
  }, [url, item, onFailure]);
  const failed = !!url && failedUrl === url;
  const readable = item?.status === 'ready' && url && !failed;
  const text = !item
    ? '暂无封面'
    : failed
      ? '图片加载失败'
      : cover && item.status === 'processing'
        ? '封面正在处理'
        : messages[item.status];
  return readable ? (
    // delivery supplies the stable, explicit thumbnail URL; never switch versions on error.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      data-share-thumbnail
      src={url}
      alt={cover ? '相册封面' : (item.displayName ?? '图片')}
      loading={cover ? 'eager' : 'lazy'}
      decoding="async"
      className={`size-full object-cover${cover ? ' object-[center_44%]' : ''}`}
      onError={() => {
        setFailedUrl(url);
        onFailure?.(item.imageId);
      }}
    />
  ) : (
    <div className="bg-default flex size-full items-center justify-center px-3 text-center text-sm leading-[22px]">
      {text}
    </div>
  );
}
