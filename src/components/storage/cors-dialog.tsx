'use client';

import { useRef, useState, type ReactNode } from 'react';
import { toast } from '@heroui/react/toast';
import { Link } from '@heroui/react/link';
import { CloseButton } from '@heroui/react/close-button';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import { Alert } from '@heroui/react/alert';
import type { CorsTestState } from '../../server/storage/cors-types';

export type CorsDialogKind = 'example' | 'origin' | 'cleanup' | 'invalidated';

export function CorsDialog({
  kind,
  state,
  onClose,
  onRefresh,
  onRetest,
  busy,
  error,
  onRetryCleanup,
  onReturn,
  retestDisabled,
  connectionRequired,
}: {
  kind: CorsDialogKind;
  state: CorsTestState;
  onClose: () => void;
  onRefresh: () => void;
  onRetest: () => void;
  busy: boolean;
  error: string;
  onRetryCleanup: (id: string) => Promise<void>;
  onReturn: () => void;
  retestDisabled: boolean;
  connectionRequired: boolean;
}) {
  const [copyError, setCopyError] = useState(false);
  const [copying, setCopying] = useState(false);
  const writing = useRef(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  async function retryCleanup(id: string) {
    await onRetryCleanup(id);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body)
        refreshButton.current?.focus();
    });
  }
  const example = `[${state.example.map((rule) => `{\n  "AllowedOrigins": ${JSON.stringify(rule.AllowedOrigins)},\n  "AllowedMethods": ${JSON.stringify(rule.AllowedMethods)},\n  "AllowedHeaders": ${JSON.stringify(rule.AllowedHeaders)}\n}`).join(',\n')}]`;
  async function copy() {
    if (writing.current) return;
    writing.current = true;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(example);
      setCopyError(false);
      toast.success('已复制到剪贴板');
    } catch {
      setCopyError(true);
      textArea.current?.focus();
      textArea.current?.select();
    } finally {
      writing.current = false;
      setCopying(false);
    }
  }
  const title =
    kind === 'example'
      ? 'CORS 配置示例'
      : kind === 'origin'
        ? '请从配置的站点地址检测'
        : kind === 'invalidated'
          ? '直传检测结果已失效'
          : state.probes.length
            ? '检测对象清理状态'
            : '本次测试对象已清理';
  let body: ReactNode;
  if (kind === 'example')
    body = (
      <>
        <p>示例来源：{state.origin}</p>
        <div className="grid gap-4 rounded-lg bg-default p-3 text-[13px]">
          <TextField aria-label="CORS 配置 JSON" isReadOnly>
            <TextArea
              ref={textArea}
              value={example}
              rows={5}
              wrap="soft"
              className="w-full resize-y [field-sizing:content] rounded-none border-0 bg-transparent p-0 text-[13px]! leading-normal shadow-none"
            />
          </TextField>
          <p>按服务商格式填写。请求方法及请求头与本次签名探测一致。</p>
        </div>
      </>
    );
  else if (kind === 'origin')
    body = (
      <>
        <p>当前访问来源与站点公开地址不一致。</p>
        <div className="grid gap-4 rounded-lg bg-default p-3 text-[13px]">
          <div>
            <p>当前来源：{window.location.origin}</p>
            <p>配置来源：{state.origin}</p>
          </div>
          <p>请从配置地址登录后重新发起检测。本次不记录直传通过。</p>
        </div>
      </>
    );
  else if (kind === 'invalidated')
    body = (
      <>
        <p>站点地址或存储配置已变更，需要重新检测。</p>
        <div className="rounded-lg bg-default p-3 text-[13px]">
          <p>已有通过结果不再使用。即使地址改回原值，也需要重新检测。</p>
          <p>旧检测任务继续收尾清理；CORS 不改变存储的私有要求。</p>
          {connectionRequired ? (
            <p>当前存储配置尚未通过连接测试，暂时不能开始直传检测。</p>
          ) : null}
        </div>
      </>
    );
  else
    body = (
      <>
        <p>检测结果与清理状态分别记录。</p>
        <div className="grid gap-4 rounded-lg bg-default p-3 text-[13px]">
          {state.probes.length ? (
            state.probes.map((probe) => (
              <div key={probe.probeId}>
                <p>
                  {probe.state === 'running'
                    ? '检测仍在进行，保留对象引用。'
                    : '已知对象尚未清理，保留引用并等待重试。'}
                </p>
                <p>{probe.key}</p>
                {probe.error ? (
                  <p className="text-danger">{probe.error}</p>
                ) : null}
                {probe.state === 'cleanup' ? (
                  <Button
                    variant="outline"
                    className="mt-3 min-h-12 rounded-lg"
                    isPending={busy}
                    onPress={() => void retryCleanup(probe.probeId)}
                  >
                    重试清理
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <p>
              本次已知测试对象已删除。此结果仅涵盖本次检测对象，不代表已扫描存储中的其他对象。
            </p>
          )}
        </div>
      </>
    );
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container placement="center" className="p-4">
        <Modal.Dialog className="relative max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-none">
          <CloseButton
            aria-label="关闭对话框"
            className="absolute right-2 top-2 size-11"
            onPress={onClose}
          />
          <Modal.Header className="shrink-0 pr-8">
            <Modal.Heading className="text-xl font-medium leading-normal">
              {title}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="m-0 grid gap-4 overflow-y-auto p-0 text-sm leading-normal text-foreground [overflow-wrap:anywhere]">
            {body}
            {copyError ? (
              <p role="alert" className="text-danger">
                浏览器未允许自动复制。请选中上方完整文本，手动复制。
              </p>
            ) : null}
            {error ? (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="m-0 grid w-full shrink-0 grid-cols-1 gap-4">
            {kind === 'example' ? (
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg font-normal"
                isPending={copying}
                onPress={() => void copy()}
              >
                复制 CORS 示例
              </Button>
            ) : null}
            {kind === 'origin' ? (
              <Link
                href={new URL(window.location.pathname, state.origin).href}
                className="flex h-12 w-full items-center justify-center rounded-lg border border-border text-sm text-foreground no-underline"
              >
                打开配置地址
              </Link>
            ) : null}
            <Button
              variant={
                kind === 'cleanup' || kind === 'invalidated'
                  ? 'outline'
                  : 'primary'
              }
              className="h-12 w-full rounded-lg font-normal"
              onPress={onReturn}
            >
              返回直传设置
            </Button>
            {kind === 'cleanup' ? (
              <Button
                className="h-12 w-full rounded-lg font-normal"
                ref={refreshButton}
                isPending={busy}
                onPress={onRefresh}
              >
                刷新清理状态
              </Button>
            ) : null}
            {kind === 'invalidated' ? (
              <Button
                className="h-12 w-full rounded-lg font-normal"
                isDisabled={retestDisabled}
                onPress={onRetest}
              >
                重新检测
              </Button>
            ) : null}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
