'use client';

import { useEffect, useRef, useState } from 'react';
import { FocusScope } from 'react-aria/FocusScope';
import { usePreventScroll } from 'react-aria/usePreventScroll';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Clock, RotateCw, X } from 'lucide-react';

export function VisitorPreview({ onBack }: { onBack: () => void }) {
  usePreventScroll();
  const root = useRef<HTMLElement>(null);
  const [waiting, setWaiting] = useState(true);
  const [showImage, setShowImage] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaiting(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, [showImage]);

  return (
    <FocusScope contain restoreFocus>
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label="访客限频状态预览"
        tabIndex={-1}
        className="fixed inset-0 z-50 flex h-dvh flex-col bg-[#0b0b0d] text-white outline-none"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onBack();
          }
        }}
      >
        <p className="absolute top-6 left-4 z-10 text-xs text-white/65 sm:left-6">
          访客状态预览 · 演示
        </p>
        {showImage ? (
          <div className="min-h-0 flex-1 px-4 py-20 sm:px-12">
            {/* 原型使用本地样例，不请求正式图片或存储。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="visitor-demo-image"
              src="/sample.jpg"
              alt="重新加载后的示例图片"
              className="size-full object-contain"
            />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto px-4 py-20">
            <Card className="w-full max-w-120 gap-4 rounded-3xl border border-border bg-surface p-6 text-foreground shadow-none">
              <Clock className="size-6 text-muted" aria-hidden />
              <h1 className="text-[22px] leading-8 font-medium">
                访问较频繁，请稍后重试
              </h1>
              <p className="text-sm leading-[22px]">
                当前网络的图片请求较多，稍等片刻后可重新加载。
              </p>
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-muted"
              >
                {waiting ? '1 秒后可以重试' : '现在可以重新加载'}
              </p>
              <Button
                data-testid="visitor-retry"
                className="h-12 w-full rounded-lg text-sm"
                isDisabled={waiting}
                onPress={() => setShowImage(true)}
              >
                <RotateCw className="size-4" aria-hidden />
                重新加载
              </Button>
            </Card>
          </div>
        )}
        <Button
          data-testid="visitor-close"
          aria-label="关闭访客状态预览"
          isIconOnly
          variant="ghost"
          className="absolute top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))] z-10 size-12 min-w-0 rounded-none border-0 bg-transparent p-3 text-white/80 hover:bg-transparent hover:text-white"
          onPress={onBack}
        >
          <X className="size-6" strokeWidth={1.6} aria-hidden />
        </Button>
      </section>
    </FocusScope>
  );
}
