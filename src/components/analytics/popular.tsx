'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowUpRight, Images } from 'lucide-react';
import { Button } from '@heroui/react/button';
import type { AnalyticsOverview } from './read-analytics';
import { AnalyticsCard, number } from './presentation';

export function AnalyticsPopular({
  data,
  onStatistics,
}: {
  data: AnalyticsOverview;
  onStatistics: (imageId: string) => void;
}) {
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
        <ol className="grid">
          {data.popular.map((item, index) => {
            const name =
              item.state === 'recycled'
                ? `已回收图片 · ${item.shortId}`
                : item.displayName!;
            const content = (
              <>
                <span
                  className="w-[17px] shrink-0 text-[10px] tabular-nums text-muted md:w-[22px] md:text-xs"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-default text-xs md:size-12"
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
                  <span className="text-xs font-normal wrap-anywhere md:text-[13px]">
                    {name}
                  </span>
                  <span className="text-xs text-muted">
                    {item.state === 'recycled'
                      ? '查看回收站记录'
                      : item.thumbnailUrl
                        ? '正常图库'
                        : '无可读缩略图，历史访问保留'}
                  </span>
                  <span
                    className="mt-1 h-[5px] overflow-hidden rounded-full bg-default"
                    aria-hidden
                  >
                    <span
                      className="block h-full origin-left rounded-full bg-[var(--analytics-compressed)]"
                      style={{
                        transform: `scaleX(${item.count / data.popular[0].count})`,
                      }}
                    />
                  </span>
                </span>
                <strong
                  data-testid="analytics-popular-count"
                  className="min-w-[43px] shrink-0 text-right text-[13px] font-medium tabular-nums md:min-w-[70px] md:text-base"
                >
                  {number(item.count)}
                  <small className="ml-1 hidden text-xs font-normal md:inline">
                    次
                  </small>
                  <span className="sr-only md:hidden">次</span>
                </strong>
                <ArrowUpRight
                  size={16}
                  className="hidden shrink-0 text-muted md:block"
                  aria-hidden
                />
              </>
            );
            return (
              <li
                key={item.imageId}
                data-image-id={item.imageId}
                data-image-state={item.state}
                className="border-b border-(--analytics-grid) last:border-b-0"
              >
                <Button
                  variant="ghost"
                  aria-label={`查看${name}统计，${number(item.count)}次访问`}
                  className="h-auto min-h-[84px] w-full justify-start gap-2.5 rounded-lg bg-transparent px-0 py-3 text-left whitespace-normal text-foreground hover:bg-[color-mix(in_oklab,var(--foreground)_4%,var(--surface))] active:transform-none data-[hovered=true]:bg-[color-mix(in_oklab,var(--foreground)_4%,var(--surface))] data-[pressed=true]:transform-none md:gap-4 md:px-2"
                  onPress={() => onStatistics(item.imageId)}
                >
                  {content}
                </Button>
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
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
