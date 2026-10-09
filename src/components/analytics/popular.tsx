'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Link } from '@heroui/react/link';
import { Images } from 'lucide-react';
import type { AnalyticsOverview } from './read-analytics';
import { AnalyticsCard, number } from './presentation';

export function AnalyticsPopular({ data }: { data: AnalyticsOverview }) {
  return (
    <AnalyticsCard
      title={`热门图片 · 最近 ${data.range.days} 天`}
      testId="analytics-popular"
    >
      <p className="text-xs text-muted">
        按访问量排列，最多 10 张；不补入零访问图片。
      </p>
      {data.popular.length === 0 ? (
        <p className="py-6 text-sm text-muted">本周期暂无热门图片。</p>
      ) : (
        <ol className="grid gap-3">
          {data.popular.map((item) => {
            const name =
              item.state === 'recycled'
                ? `已回收图片 · ${item.shortId}`
                : item.displayName!;
            const content = (
              <>
                <span
                  className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-default text-xs"
                  aria-hidden
                >
                  {item.thumbnailUrl ? (
                    <PopularThumbnail
                      key={item.thumbnailUrl}
                      src={item.thumbnailUrl}
                    />
                  ) : item.state === 'recycled' ? (
                    '回收'
                  ) : (
                    <Images size={20} />
                  )}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm font-medium wrap-anywhere">
                    {name}
                  </span>
                  <span className="text-xs text-muted">
                    {item.state === 'recycled'
                      ? '查看回收站记录'
                      : item.thumbnailUrl
                        ? '正常图库'
                        : '无可读缩略图，历史访问保留'}{' '}
                    · {number(item.count)} 次
                  </span>
                </span>
              </>
            );
            return (
              <li
                key={item.imageId}
                data-image-id={item.imageId}
                data-image-state={item.state}
              >
                <Link
                  href={item.managementUrl}
                  className="flex min-h-12 w-full gap-3 rounded-lg text-foreground"
                >
                  {content}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </AnalyticsCard>
  );
}

function PopularThumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Images size={20} aria-label="缩略图读取失败" />
  ) : (
    <Image
      src={src}
      unoptimized
      width={48}
      height={48}
      alt=""
      className="size-12 object-cover"
      onError={() => setFailed(true)}
    />
  );
}
