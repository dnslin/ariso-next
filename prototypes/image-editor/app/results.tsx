'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button, Link, ProgressBar } from '@heroui/react';
import {
  Check,
  CircleAlert,
  Clock3,
  Download,
  Images,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useDemo } from './store';

export function Results() {
  const demo = useDemo();
  const router = useRouter();
  const success = demo.results.filter((item) => item.status === 'succeeded');
  const failed = demo.results.filter((item) => item.status === 'failed');
  const cancelled = demo.results.filter((item) => item.status === 'cancelled');
  const total = demo.results.length;
  const done = success.length + failed.length + cancelled.length;
  return (
    <section className="mx-auto grid max-w-5xl gap-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>
            {demo.saving
              ? '正在保存图片'
              : failed.length
                ? '部分图片未保存'
                : cancelled.length
                  ? '已停止保存'
                  : total
                    ? '编辑已保存'
                    : '保存结果'}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {demo.saving
              ? '已受理的图片逐张处理，完成后可查看结果。'
              : '本页为演示保存结果，未写入正式图库。可下载真实编辑后的 PNG。'}
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11 rounded-lg"
          onPress={() => router.push('/library')}
        >
          <Images size={17} />
          返回图库
        </Button>
      </header>
      {!total ? (
        <div className="grid justify-items-center gap-4 rounded-2xl border border-border py-16">
          <Images size={32} className="text-muted" />
          <h2 className="text-lg">还没有保存结果</h2>
          <Button onPress={() => demo.openEditor('account')}>去编辑图片</Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-default/25 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {success.length} 张成功
                {failed.length ? `，${failed.length} 张失败` : ''}
                {cancelled.length ? `，${cancelled.length} 张未开始` : ''}
              </p>
              <span className="text-xs text-muted">
                {done} / {total} 已处理
              </span>
            </div>
            <ProgressBar
              aria-label="图片保存进度"
              value={done}
              maxValue={total}
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            {demo.saving && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="ghost"
                  className="min-h-11 text-xs"
                  onPress={demo.cancelPending}
                >
                  <Square size={13} />
                  停止尚未开始的任务
                </Button>
              </div>
            )}
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {demo.results.map((item) => (
              <article
                key={item.id}
                data-result-status={item.status}
                className="flex flex-wrap items-center gap-4 bg-surface p-4"
              >
                <Image
                  unoptimized
                  src={item.resultSrc ?? item.source.src}
                  alt={item.source.name}
                  width={96}
                  height={70}
                  className="h-18 w-24 rounded-lg border border-border object-contain"
                />
                <div className="min-w-0 flex-1 basis-36">
                  <h2 className="truncate text-sm font-medium">
                    {item.source.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {item.mode === 'copy'
                      ? '另存为新图 · 原图保留'
                      : '覆盖原图 · 保持原链接'}
                  </p>
                  <p
                    className={`mt-2 flex items-center gap-1.5 text-xs ${item.status === 'failed' ? 'text-danger' : 'text-muted'}`}
                    role="status"
                  >
                    {item.status === 'succeeded' ? (
                      <>
                        <Check size={14} />
                        已保存
                      </>
                    ) : item.status === 'failed' ? (
                      <>
                        <CircleAlert size={14} />
                        {item.error}
                      </>
                    ) : item.status === 'cancelled' ? (
                      <>
                        <Square size={13} />
                        尚未开始，未修改图片
                      </>
                    ) : (
                      <>
                        <Clock3 size={13} />
                        {item.status === 'processing'
                          ? '正在生成编辑结果…'
                          : '等待处理'}
                      </>
                    )}
                  </p>
                </div>
                {item.status === 'succeeded' && item.resultSrc && (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                      variant="outline"
                      className="min-h-11 flex-1 rounded-lg text-xs sm:flex-none"
                      onPress={() => demo.openEditor(item.resultImageId!)}
                    >
                      查看图片
                    </Button>
                    <Link
                      href={item.resultSrc}
                      download={`${item.source.name.replace(/\.[^.]+$/, '')}-编辑.png`}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 text-xs sm:flex-none"
                    >
                      <Download size={15} />
                      下载 PNG
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
          {!demo.saving && (
            <div className="flex flex-wrap justify-end gap-3">
              {cancelled.length > 0 && (
                <Button
                  variant="outline"
                  className="min-h-11 rounded-lg"
                  onPress={() => {
                    void demo.saveImages(
                      cancelled.map((item) => item.source.id),
                      true,
                    );
                  }}
                >
                  继续未开始的 {cancelled.length} 张
                </Button>
              )}
              {failed.length > 0 && (
                <Button
                  variant="primary"
                  className="min-h-11 rounded-lg"
                  onPress={() => {
                    void demo.saveImages(
                      failed.map((item) => item.source.id),
                      true,
                    );
                  }}
                >
                  <RotateCcw size={16} />
                  仅重试失败的 {failed.length} 张
                </Button>
              )}
              <Button
                variant="secondary"
                className="min-h-11 rounded-lg"
                onPress={() => router.push('/library')}
              >
                完成
                <Check size={16} />
              </Button>
            </div>
          )}
          <p className="text-xs leading-5 text-muted">
            下载文件包含实际打码和水印。演示中的保存方式、处理进度与重试不代表已完成服务器、外链或存储验证。
          </p>
        </>
      )}
    </section>
  );
}
