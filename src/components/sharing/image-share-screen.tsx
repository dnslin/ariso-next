'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import { Clock3, Unlink } from 'lucide-react';
import { ShareBrandHeading, type ShareBrand } from './brand';

type View = { expiresAt: string; mediaUrl: string };
export function ImageShareScreen({
  token,
  initial,
  brand,
  timeZone,
}: {
  token: string;
  initial: { status: number; view: View | null };
  brand: ShareBrand;
  timeZone: string;
}) {
  const [status, setStatus] = useState(initial.status);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const mediaUrl = `/s/image/${encodeURIComponent(token)}/media`;
  const check = useCallback(
    async (retryImage = false) => {
      if (activeRequest.current) return;
      const controller = new AbortController();
      activeRequest.current = controller;
      setChecking(true);
      try {
        const response = await fetch(mediaUrl, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setStatus(response.status);
        if (response.ok && retryImage) {
          setFailed(false);
          setRevision((value) => value + 1);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setChecking(false);
        }
      }
    },
    [mediaUrl],
  );
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      activeRequest.current?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [check]);
  useEffect(() => {
    if (!initial.view) return;
    const timer = window.setTimeout(
      () => setStatus(410),
      Math.max(0, Date.parse(initial.view.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [initial.view]);
  const unavailable = status === 404 || status === 410;
  const canShow = status === 200 && !failed;
  return (
    <section className="mx-auto grid min-h-dvh w-full max-w-5xl content-start gap-6 px-4 pt-20 pb-8 md:gap-8 md:px-8 md:pt-24">
      <ShareBrandHeading brand={brand} />
      {canShow ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-medium">临时图片分享</h1>
            {initial.view ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <Clock3 size={16} aria-hidden />
                <time dateTime={initial.view.expiresAt}>
                  {new Intl.DateTimeFormat('zh-CN', {
                    timeZone,
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    hour12: false,
                  }).format(new Date(initial.view.expiresAt))}{' '}
                  到期
                </time>
              </p>
            ) : null}
          </div>
          <div className="relative h-[66dvh] overflow-hidden rounded-2xl bg-default">
            <Image
              key={revision}
              src={mediaUrl}
              alt="临时分享的图片"
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 960px"
              className="object-contain"
              onError={() => {
                setFailed(true);
                void check();
              }}
            />
          </div>
          <p className="text-center text-xs text-muted">
            此地址仅分享这一张图片。页面不展示图片名称和拍摄信息。
          </p>
        </>
      ) : (
        <Card
          role="region"
          aria-labelledby="image-share-state-title"
          className="mx-auto w-full max-w-120 gap-4 rounded-2xl border border-border bg-surface p-6 shadow-none"
        >
          <Card.Header className="grid gap-3">
            <Unlink size={28} aria-hidden className="text-muted" />
            <h1 id="image-share-state-title" className="text-xl font-medium">
              {unavailable ? '分享已失效' : '图片暂时无法读取'}
            </h1>
          </Card.Header>
          <Card.Content className="grid gap-4 p-0">
            <p role="status" className="text-sm leading-6 text-muted">
              {unavailable
                ? '链接可能已到期或被撤销，请联系分享者获取新的地址。'
                : '图片可能暂时不可用，请稍后重新检查。'}
            </p>
            {!unavailable ? (
              <Button
                className="min-h-12 rounded-lg"
                isDisabled={checking}
                onPress={() => {
                  void check(true);
                }}
              >
                {checking ? <Spinner size="sm" /> : null}重新检查
              </Button>
            ) : null}
          </Card.Content>
        </Card>
      )}
    </section>
  );
}
