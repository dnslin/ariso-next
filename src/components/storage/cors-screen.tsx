'use client';

import { useRef, useState, type ComponentProps } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import { OwnerShell } from '../shell/owner-shell';
import { CorsDialog, type CorsDialogKind } from './cors-dialog';
import { CorsReportRows, CorsRows } from './cors-report';
import { useCorsTest } from './use-cors-test';

const actionClass =
  'h-12 min-w-0 flex-1 rounded-lg px-2 text-sm font-normal min-[1200px]:w-50 min-[1200px]:flex-none';

export function CorsScreen({
  storageId,
  ...shell
}: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'> & {
  storageId: string;
}) {
  const { query, busy, testing, message, start, refresh, retryCleanup } =
    useCorsTest(storageId);
  const [overview, setOverview] = useState(false);
  const [dialog, setDialog] = useState<CorsDialogKind | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const state = query.isError ? undefined : query.data?.state;
  const storage = query.data?.storage;
  const active = state?.probes.find((probe) => probe.state === 'running');
  const running = Boolean(active) || testing;
  const result =
    !overview &&
    (running || state?.status === 'passed' || state?.status === 'failed');
  const connected =
    storage?.connectionStatus === 'passed' &&
    storage.connectionRevision === storage.configRevision;
  const disabled = busy || Boolean(active) || !connected || query.isError;
  const report = running ? (active?.report ?? null) : (state?.report ?? null);
  function open(kind: CorsDialogKind) {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDialog(kind);
  }
  function close() {
    setDialog(null);
    requestAnimationFrame(() => opener.current?.focus());
  }
  function begin() {
    if (!state || disabled) return;
    if (window.location.origin !== state.origin) {
      open('origin');
      return;
    }
    setDialog(null);
    setOverview(false);
    void start();
  }
  const title = query.isError
    ? '无法读取直传设置'
    : result
      ? running
        ? '正在检测浏览器直传'
        : state?.status === 'passed'
          ? '浏览器直传检测通过'
          : '直传检测失败'
      : '浏览器直传设置';
  const footer =
    state && !query.isError ? (
      <>
        <Button
          variant="outline"
          className={actionClass}
          onPress={() => {
            if (running && result) setOverview(true);
            else open(result ? 'cleanup' : 'example');
          }}
        >
          {running && result
            ? '返回直传设置'
            : result
              ? '查看清理状态'
              : '查看 CORS 示例'}
        </Button>
        {result && running ? (
          <Button className={actionClass} onPress={() => void refresh()}>
            查看检测结果
          </Button>
        ) : result && state.status === 'passed' ? (
          <Button className={actionClass} isDisabled>
            管理此存储（尚未开放）
          </Button>
        ) : (
          <Button
            data-testid="cors-start"
            className={actionClass}
            isDisabled={disabled}
            onPress={begin}
          >
            {state.status === 'untested' ? '开始直传检测' : '重新检测'}
          </Button>
        )}
      </>
    ) : undefined;
  return (
    <OwnerShell {...shell} footer={footer}>
      <section
        data-testid="storage-cors"
        data-state={
          query.isError
            ? 'error'
            : running
              ? 'running'
              : (state?.status ?? 'loading')
        }
        className="grid gap-5 pb-10 [overflow-wrap:anywhere]"
      >
        <span
          aria-disabled="true"
          className="text-xs leading-normal text-muted"
        >
          ← 返回存储管理（尚未开放）
        </span>
        <h1 className="text-[28px] font-medium leading-normal min-[1200px]:text-[30px]">
          {title}
        </h1>
        {query.isPending ? (
          <p role="status" className="flex items-center gap-2">
            <Spinner size="sm" />
            正在读取直传设置
          </p>
        ) : query.isError ? (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>无法读取直传设置</Alert.Title>
              <Alert.Description>{query.error.message}</Alert.Description>
              <Button
                variant="outline"
                className="mt-3 min-h-11"
                onPress={() => void refresh()}
              >
                重新加载
              </Button>
            </Alert.Content>
          </Alert>
        ) : state && storage ? (
          <>
            <p className="min-h-[22px] text-[13px] leading-normal">
              {running
                ? `检测来源：${state.origin}`
                : `${storage.name} · S3 · ${state.status === 'passed' ? '配置来源检测通过' : state.status === 'invalidated' ? '检测结果已失效' : state.status === 'failed' ? '直传检测未通过' : '尚未进行直传检测'}`}
            </p>
            <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
              {result
                ? running
                  ? '请保持此页打开。关闭页面不会取消服务端清理责任；中途退出后可重新检测。'
                  : state.status === 'passed'
                    ? '浏览器响应、服务器核验和本次测试对象清理均已通过。检测不会改变当前上传方式。'
                    : '直传检测未通过。请检查下方结果；清理状态单独记录，未完成的清理可以重试。'
                : '到对象存储控制台配置 CORS。Ariso 不会自动修改 Bucket 设置；CORS 与 Bucket 私有性是两件事。'}
            </p>
            {result ? (
              <CorsReportRows report={report} state={state} busy={running} />
            ) : (
              <CorsRows
                rows={[
                  {
                    label: '允许来源',
                    value: state.origin,
                    detail: '只填写当前站点来源',
                  },
                  {
                    label: '允许方法',
                    value: state.example[0].AllowedMethods.join(' / '),
                    detail: '不要把 OPTIONS 填为 AllowedMethods',
                  },
                  {
                    label: '请求头',
                    value: state.example[0].AllowedHeaders.join(' / '),
                    detail: '与本次签名探测一致',
                  },
                  {
                    label: '检测方式',
                    value: '当前浏览器发送样本',
                    detail: '服务器核验内容并清理',
                  },
                ]}
              />
            )}
            {!connected ? (
              <p role="status" className="text-sm">
                当前存储配置尚未通过连接测试，暂时不能开始直传检测。
              </p>
            ) : null}
            {state.status === 'invalidated' && !running ? (
              <Button
                variant="outline"
                className="min-h-11 justify-self-start"
                onPress={() => open('invalidated')}
              >
                查看失效原因
              </Button>
            ) : null}
            {message ? (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Description>{message}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            {dialog ? (
              <CorsDialog
                kind={dialog}
                state={state}
                onClose={close}
                onRefresh={() => void refresh()}
                onRetest={begin}
                busy={busy}
                error={message}
                onRetryCleanup={retryCleanup}
                onReturn={() => {
                  setOverview(true);
                  close();
                }}
                retestDisabled={disabled}
                connectionRequired={!connected}
              />
            ) : null}
          </>
        ) : null}
      </section>
    </OwnerShell>
  );
}
