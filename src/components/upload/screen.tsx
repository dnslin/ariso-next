'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Toolbar } from '@heroui/react/toolbar';
import { Tooltip } from '@heroui/react/tooltip';
import type { UploadItem } from './types';
import { CheckCircle2, CloudUpload } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { LibraryDetail } from '../library/detail';
import { DetailReadError } from '../library/read-detail';
import { bytesLabel } from '../library/detail-labels';
import { UploadController } from './controller';
import { UploadSettingsFields, type UploadSettings } from './settings';
import { UploadQueueItem } from './item';

type ScreenProps = {
  name: string;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
};
async function readSettings(signal: AbortSignal): Promise<UploadSettings> {
  const response = await fetch('/upload/settings', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json();
    throw new DetailReadError(
      `${body.message}（HTTP ${response.status}）`,
      response.status,
    );
  }
  return response.json();
}

const emptySubscribe = () => () => {};
const emptyItems: readonly UploadItem[] = [];
const emptySnapshot = () => emptyItems;
const terminalStates = new Set([
  'ready',
  'upload-failed',
  'processing-failed',
  'cancelled',
]);

export function UploadScreen(props: ScreenProps) {
  const [client] = useState(() => new QueryClient());
  const query = useQuery(
    {
      queryKey: ['upload-settings'],
      queryFn: ({ signal }) => readSettings(signal),
      retry: false,
      networkMode: 'always',
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
    client,
  );
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (query.error instanceof DetailReadError && query.error.status === 401)
      window.location.replace('/login?reason=expired&returnTo=%2Fupload');
  }, [query.error]);
  const settings = query.data;
  const maxFileBytes = settings?.maxFileBytes;
  const queueLimit = settings?.queueLimit;
  const [controller, setController] = useState<UploadController | null>(null);
  useEffect(() => {
    if (maxFileBytes === undefined || queueLimit === undefined) return;
    const instance = new UploadController({
      maxFileBytes,
      queueLimit,
      onUnauthorized: () =>
        window.location.replace('/login?reason=expired&returnTo=%2Fupload'),
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Publish the newly owned external store; each effect setup owns its own cleanup, including StrictMode.
    setController(instance);
    return () => instance.destroy();
  }, [maxFileBytes, queueLimit]);
  const items = useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    controller?.getSnapshot ?? emptySnapshot,
  );
  const [chosenStorageId, setStorageId] = useState<string>();
  const [chosenVisibility, setVisibility] =
    useState<UploadSettings['defaultVisibility']>();
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const queuedCount = items.filter((item) => item.state === 'queued').length;
  const completedCount = items.filter((item) =>
    terminalStates.has(item.state),
  ).length;
  const terminal = items.length > 0 && completedCount === items.length;
  const saving =
    items.length > 0 && items.every((item) => item.state === 'saving');
  const uploading = items.some((item) => item.state === 'uploading');
  const readyCount = items.filter((item) => item.state === 'ready').length;
  const polling = items.some((item) =>
    ['saving', 'processing-queued', 'processing', 'waiting-upload'].includes(
      item.state,
    ),
  );
  const hasLocalWork = items.some(
    (item) => !terminalStates.has(item.state) && !item.imageId,
  );
  useEffect(() => {
    if (!controller || !polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        async () => {
          await controller.refresh();
          // A skipped or stale read need not change the item; keep polling it.
          if (!stopped) schedule();
        },
        document.hidden ? 10000 : 2000,
      );
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [controller, polling]);
  useEffect(() => {
    if (!hasLocalWork) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasLocalWork]);
  const dialogRef = useCallback((node: HTMLElement | null) => {
    if (!node)
      requestAnimationFrame(() =>
        (trigger.current?.isConnected
          ? trigger.current
          : document.getElementById('upload-title')
        )?.focus({ preventScroll: true }),
      );
  }, []);
  if (!settings)
    return (
      <OwnerShell {...props}>
        <h1 className="mb-5 text-[28px] font-medium leading-normal md:text-[30px]">
          上传图片
        </h1>
        {query.isPending ? (
          <p role="status">正在读取上传设置…</p>
        ) : (
          <div className="grid gap-4">
            <Alert status="danger" role="alert">
              <Alert.Content>
                <Alert.Title>上传设置读取失败</Alert.Title>
                <Alert.Description>{query.error?.message}</Alert.Description>
              </Alert.Content>
            </Alert>
            <Button
              className="min-h-11"
              onPress={() => {
                void query.refetch();
              }}
            >
              重试读取设置
            </Button>
          </div>
        )}
      </OwnerShell>
    );
  if (!controller)
    return (
      <OwnerShell {...props}>
        <h1 className="mb-5 text-[28px] font-medium leading-normal md:text-[30px]">
          上传图片
        </h1>
        <p role="status">正在准备上传队列…</p>
      </OwnerShell>
    );
  const storageId = chosenStorageId ?? settings.defaultStorageId;
  const visibility = chosenVisibility ?? settings.defaultVisibility;
  const selectedStorage = settings.storages.find(
    (s) => s.id === storageId && s.enabled,
  );
  function choose() {
    setError('');
    input.current?.click();
  }
  return (
    <OwnerShell
      {...props}
      footer={
        <div className="flex w-full gap-3 md:justify-end [&_.button]:min-h-12 [&_.button]:rounded-lg">
          {completedCount > 0 ? (
            <Button
              variant="outline"
              className="flex-1 md:max-w-45"
              onPress={() => {
                controller.clearCompleted();
                setError('');
              }}
            >
              清空已完成
            </Button>
          ) : null}
          {items.length > 0 ? (
            <Button
              variant="outline"
              className="flex-1 md:hidden"
              onPress={choose}
            >
              继续添加
            </Button>
          ) : null}
          <Button
            className="flex-1 md:max-w-50"
            isDisabled={queuedCount === 0 || !selectedStorage}
            onPress={() => {
              if (selectedStorage)
                void controller.start(
                  visibility,
                  chosenStorageId !== undefined
                    ? selectedStorage.id
                    : undefined,
                );
            }}
          >
            开始上传
          </Button>
        </div>
      }
    >
      <section
        className="grid w-full min-w-0 gap-5 md:gap-6 [&_.button]:min-h-11 [&_.button]:rounded-lg"
        aria-labelledby="upload-title"
      >
        <div className="grid gap-1.5">
          <h1
            id="upload-title"
            tabIndex={-1}
            className="flex items-center gap-3 text-[28px] font-medium leading-normal md:text-[30px]"
          >
            {terminal
              ? '本次上传结果'
              : saving
                ? '正在核对上传结果'
                : '上传图片'}
            {uploading ? (
              <span
                aria-hidden
                className="motion-safe:animate-pulse"
                data-testid="upload-motion"
              >
                <CloudUpload size={28} />
              </span>
            ) : terminal && readyCount > 0 ? (
              <span
                aria-hidden
                className="text-success"
                data-testid="upload-success-icon"
              >
                <CheckCircle2 size={28} />
              </span>
            ) : null}
          </h1>
          <p className="text-sm">
            {terminal
              ? `成功 ${readyCount} 张 · 失败 ${items.filter((item) => item.state === 'upload-failed' || item.state === 'processing-failed').length} 张 · 取消 ${items.filter((item) => item.state === 'cancelled').length} 张。清空结果不会删除图片。`
              : saving
                ? '文件传输结束，正在核对保存与处理结果。'
                : '选择图片，确认本次设置后开始上传。'}
          </p>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          aria-label="选择图片文件"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            const errors: string[] = [];
            for (const file of files) {
              const reason = controller.add(file);
              if (reason) errors.push(`${file.name}：${reason}`);
            }
            setError(errors.join('\n'));
          }}
        />
        <div
          data-testid="upload-composition"
          className="grid min-w-0 items-start gap-3 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6"
        >
          {items.length ? (
            <Card
              data-testid="upload-queue"
              className="min-w-0 gap-4 rounded-2xl border border-border bg-background px-3 py-4 shadow-none md:rounded-[20px] md:p-6"
            >
              <Toolbar
                aria-label="上传队列操作"
                className="hidden min-h-11 w-full items-center justify-between gap-3 md:flex"
              >
                <h2 className="text-lg font-medium">
                  上传队列 · 待上传 {queuedCount} 张
                </h2>
                <Tooltip>
                  <Button
                    variant="outline"
                    className="min-h-11 w-30 shrink-0"
                    onPress={choose}
                  >
                    继续添加
                  </Button>
                  <Tooltip.Content>可多选图片，已选文件会保留</Tooltip.Content>
                </Tooltip>
              </Toolbar>
              {items.map((item) => (
                <UploadQueueItem
                  key={item.id}
                  item={item}
                  controller={controller}
                  client={client}
                  onOpen={(id, element) => {
                    trigger.current = element;
                    setDetailId(id);
                  }}
                />
              ))}
            </Card>
          ) : (
            <Card
              data-testid="upload-picker"
              className="min-h-70 min-w-0 items-center justify-center gap-4 rounded-[20px] border border-dashed border-border bg-surface px-4 py-5 text-center shadow-none md:min-h-90 md:p-6"
            >
              <span
                aria-hidden
                data-testid="upload-idle-motion"
                className="motion-safe:animate-[upload-float_2.8s_ease-in-out_infinite]"
              >
                <CloudUpload size={40} />
              </span>
              <h2 className="text-[26px] font-medium">选择要上传的图片</h2>
              <p className="text-sm">
                JPEG、PNG · 单文件最大 {bytesLabel(settings.maxFileBytes)}
              </p>
              <Button className="min-h-12 w-36" onPress={choose}>
                选择图片
              </Button>
            </Card>
          )}
          <UploadSettingsFields
            settings={settings}
            storageId={storageId}
            visibility={visibility}
            disabled={false}
            onStorage={setStorageId}
            onVisibility={setVisibility}
          />
        </div>
        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Content>
              <Alert.Description className="whitespace-pre-wrap">
                {error}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
      </section>
      {detailId ? (
        <LibraryDetail
          key={detailId}
          imageId={detailId}
          returnTo="/upload"
          client={client}
          dialogRef={dialogRef}
          onClose={() => setDetailId(null)}
          onTrashed={() => {
            setDetailId(null);
            void client.invalidateQueries({ queryKey: ['upload-result'] });
          }}
        />
      ) : null}
    </OwnerShell>
  );
}
