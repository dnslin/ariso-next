'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Card, Chip } from '@heroui/react';
import {
  ArrowLeft,
  CircleAlert,
  Code2,
  Play,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { PrototypeFrame } from './frame';
import { useDemo } from './providers';

const duplicateResponse = {
  imageId: null,
  status: 'not_created',
  error: {
    code: 'UPLOAD_DUPLICATE',
    stage: 'deduplication',
    message: '相同图片已存在，本次未新增。请登录图库核对。',
  },
  requestId: 'demo-upload-001',
};

export function ApiPreview({ active = true }: { active?: boolean }) {
  const { setScenario } = useDemo();
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function submit() {
    if (state === 'sending') return;
    setState('sending');
    timer.current = setTimeout(() => setState('done'), 700);
  }
  if (!active) return null;
  return (
    <PrototypeFrame>
      <section
        className="grid max-w-240 gap-6"
        aria-labelledby="api-demo-title"
      >
        <div className="flex items-center justify-between gap-4">
          <h1
            id="api-demo-title"
            className="text-2xl font-medium md:text-[28px]"
          >
            API 与 PicGo
          </h1>
          <Button
            variant="ghost"
            className="min-h-11 shrink-0 rounded-lg"
            onPress={() => setScenario('normal')}
          >
            <ArrowLeft size={17} aria-hidden />
            返回上传
          </Button>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-default p-4">
          <ShieldCheck size={20} className="shrink-0" aria-hidden />
          <p className="text-sm leading-6">
            上传 Token 只负责上传。重复时明确报错，不返回已有图片的
            ID、详情或链接。
          </p>
        </div>
        <Card className="gap-5 rounded-[20px] border border-border bg-surface p-5 shadow-none md:p-6">
          <div className="flex items-center gap-2">
            <Code2 size={19} aria-hidden />
            <h2 className="text-lg font-medium">提交相同文件</h2>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-background p-4 text-sm">
            <p className="font-mono">POST /api/upload</p>
            <p className="text-muted">文件：湖边清晨-副本.jpg</p>
            <p className="text-xs leading-5 text-muted">
              此处只演示响应，不输入 Token，也不发出网络请求。
            </p>
          </div>
          <Button
            className="min-h-12 w-full rounded-lg sm:w-fit"
            isDisabled={state === 'sending'}
            onPress={submit}
          >
            {state === 'done' ? (
              <RotateCcw size={16} aria-hidden />
            ) : (
              <Play size={16} aria-hidden />
            )}
            {state === 'sending'
              ? '正在模拟提交…'
              : state === 'done'
                ? '再次演示'
                : '模拟提交'}
          </Button>
          {state === 'done' && (
            <div
              className="grid gap-3 border-t border-border pt-5"
              aria-live="polite"
            >
              <Chip color="warning" variant="soft" className="w-fit gap-1.5">
                <CircleAlert size={15} aria-hidden />
                409 · 重复文件
              </Chip>
              <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-xl bg-default p-4 text-xs leading-6 [overflow-wrap:anywhere]">
                {JSON.stringify(duplicateResponse, null, 2)}
              </pre>
            </div>
          )}
        </Card>
        {state === 'done' && (
          <Card className="gap-3 rounded-[20px] border border-border bg-surface p-5 shadow-none md:p-6">
            <h2 className="text-lg font-medium">PicGo 收到的结果</h2>
            <p role="status" className="text-sm leading-6">
              图片已存在，本次未新增。请登录 Ariso 图库查看。
            </p>
            <p className="text-sm leading-6 text-muted">
              本次上传停止，不返回部分链接，也不替换编辑器中的图片地址。此前已经保存的图片保留。
            </p>
          </Card>
        )}
      </section>
    </PrototypeFrame>
  );
}
