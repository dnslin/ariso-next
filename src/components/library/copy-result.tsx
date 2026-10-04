'use client';

import { useLayoutEffect, useRef } from 'react';
import { Button } from '@heroui/react/button';
import { ImageOff } from 'lucide-react';
import { bytesLabel, versionLabels } from './detail-labels';
import { DetailReturn } from './detail-controls';
import type { LibraryCopy } from './use-library-copy';

export function CopyResult({ copy }: { copy: LibraryCopy }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!copy.contentVisible) return;
    const element = heading.current;
    const scroller = element?.closest('main');
    if (scroller) scroller.scrollTop = 0;
    if (copy.manual) return;
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        element?.focus({ preventScroll: true }),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
    };
  }, [copy.contentVisible, copy.manual]);
  const workspace = copy.workspace;
  if (!workspace?.result || !copy.contentVisible) return null;
  const { result, preview } = workspace;
  const warnings = [
    ...new Set(
      result.items.flatMap((item) =>
        item.accessWarning ? [item.accessWarning] : [],
      ),
    ),
  ];
  return (
    <section
      data-testid="library-copy-result"
      aria-labelledby="library-copy-title"
      className="grid min-w-0 gap-3 xl:gap-4"
    >
      <DetailReturn onPress={() => copy.close()}>
        {copy.returnLabel}
      </DetailReturn>
      <h1
        id="library-copy-title"
        data-testid="library-copy-title"
        ref={heading}
        tabIndex={-1}
        className="text-[28px] font-medium leading-normal xl:text-[30px]"
      >
        {workspace.copied ? '已复制' : '已生成'} {result.items.length} 条
        {result.unavailable.length
          ? `，${result.unavailable.length} 张无法复制`
          : ''}
      </h1>
      <p className="text-[13px] leading-normal">
        {workspace.items.length} 张已选图片 ·{' '}
        {workspace.version === 'default'
          ? '默认'
          : versionLabels[workspace.version]}{' '}
        {workspace.format === 'markdown'
          ? 'Markdown'
          : workspace.format.toUpperCase()}
      </p>
      <div className="flex min-w-0 items-center gap-3 xl:gap-6">
        <div className="grid h-15 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-default xl:h-21 xl:w-28">
          {preview.url ? (
            <img // eslint-disable-line @next/next/no-img-element
              src={preview.url}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <ImageOff
              size={22}
              aria-label={preview.reason ?? '没有可读缩略图'}
            />
          )}
        </div>
        <div className="min-w-0 text-[13px] leading-normal [overflow-wrap:anywhere]">
          <p>{preview.item.displayName}</p>
          <p>
            原图
            {preview.item.byteSize === undefined
              ? ''
              : ` · ${bytesLabel(preview.item.byteSize)}`}
          </p>
          {preview.reason ? (
            <p className="text-xs text-muted">{preview.reason}</p>
          ) : null}
        </div>
      </div>
      <div className="grid rounded-lg bg-default p-3 text-[13px] leading-normal">
        <p>按当前查询顺序输出，一张一行。</p>
        <p>复制链接不会把私有图片改为公开。</p>
        {warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
        {result.items.some((item) => item.originalDisclosure) ? (
          <p>公开原图可能包含 GPS 和拍摄信息。</p>
        ) : null}
      </div>
      <dl className="rounded-2xl border border-border px-3 py-2 text-sm leading-normal xl:px-5">
        <div className="grid min-h-18 content-start gap-0 xl:grid-cols-3 xl:content-center xl:gap-4">
          <dt>{result.items.length} 张图片</dt>
          <dd>
            {workspace.copied ? '链接已复制' : '链接已生成，等待手动复制'}
            <span className="xl:hidden">
              {' '}
              ·{' '}
              {workspace.items.length > workspace.currentCount
                ? '包含其他页'
                : '当前页'}
            </span>
          </dd>
          <dd className="hidden xl:block">
            {workspace.items.length > workspace.currentCount
              ? '包含其他页'
              : '当前页'}
          </dd>
        </div>
        {result.unavailable.map((item) => (
          <div
            key={item.imageId}
            data-copy-unavailable={item.imageId}
            className="grid min-h-18 content-start gap-0 [overflow-wrap:anywhere] xl:grid-cols-3 xl:content-center xl:gap-4"
          >
            <dt>{item.displayName}</dt>
            <dd>
              {item.reason}
              <span className="xl:hidden"> · 未复制</span>
            </dd>
            <dd className="hidden xl:block">未复制</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CopyResultFooter({ copy }: { copy: LibraryCopy }) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 xl:w-auto xl:grid-cols-[200px_200px]">
      <Button
        data-testid="library-copy-return"
        variant="outline"
        onPress={copy.returnToSelection}
        className="h-12 w-full rounded-lg font-normal"
      >
        返回已选清单
      </Button>
      <Button
        data-testid="library-copy-again"
        onPress={copy.chooseAgain}
        className="h-12 w-full rounded-lg font-normal"
      >
        重新复制
      </Button>
    </div>
  );
}
