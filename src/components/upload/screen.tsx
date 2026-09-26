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
const emptySnapshot = () => null;

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
  const [controller, setController] = useState<UploadController | null>(null);
  useEffect(() => {
    if (maxFileBytes === undefined) return;
    const instance = new UploadController({
      maxFileBytes,
      onUnauthorized: () =>
        window.location.replace('/login?reason=expired&returnTo=%2Fupload'),
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Publish the newly owned external store; each effect setup owns its own cleanup, including StrictMode.
    setController(instance);
    return () => instance.destroy();
  }, [maxFileBytes]);
  const item = useSyncExternalStore(
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
  const terminal =
    !!item &&
    ['ready', 'upload-failed', 'processing-failed', 'cancelled'].includes(
      item.state,
    );
  const frozen = !!item && item.state !== 'queued';
  const polling =
    !!item &&
    ['saving', 'processing-queued', 'processing'].includes(item.state);
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
    if (!item || terminal || item.imageId) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [item, terminal]);
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
    if (terminal) controller?.clearCompleted();
    setError('');
    input.current?.click();
  }
  return (
    <OwnerShell
      {...props}
      footer={
        <div className="flex w-full gap-3 md:justify-end [&_.button]:min-h-12 [&_.button]:rounded-lg">
          {terminal ? (
            <>
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
              <Button className="flex-1 md:max-w-50" onPress={choose}>
                继续上传
              </Button>
            </>
          ) : (
            <Button
              className="w-full md:w-50"
              isDisabled={item?.state !== 'queued' || !selectedStorage}
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
          )}
        </div>
      }
    >
      <section
        className="grid w-full min-w-0 max-w-300 gap-5 md:gap-6 [&_.button]:min-h-11 [&_.button]:rounded-lg"
        aria-labelledby="upload-title"
      >
        <div
          className={`grid ${terminal || item?.state === 'saving' ? 'gap-5' : 'gap-1.5'}`}
        >
          <h1
            id="upload-title"
            tabIndex={-1}
            className="flex items-center gap-3 text-[28px] font-medium leading-normal md:text-[30px]"
          >
            {terminal
              ? '本次上传结果'
              : item?.state === 'saving'
                ? '正在核对上传结果'
                : '上传图片'}
            {item?.state === 'uploading' ? (
              <span
                aria-hidden
                className="motion-safe:animate-pulse"
                data-testid="upload-motion"
              >
                <CloudUpload size={28} />
              </span>
            ) : item?.state === 'ready' ? (
              <span
                aria-hidden
                className="text-success transition-opacity duration-200 ease-(--ease-out) starting:opacity-0"
                data-testid="upload-success-icon"
              >
                <CheckCircle2 size={28} />
              </span>
            ) : null}
          </h1>
          <p
            className={
              terminal || item?.state === 'saving'
                ? 'rounded-lg bg-default p-3 text-[13px] leading-normal'
                : 'text-sm'
            }
          >
            {terminal
              ? `${item?.state === 'ready' ? '成功 1 张' : item?.state === 'processing-failed' ? '处理失败 1 张 · 原图保留' : item?.state === 'cancelled' ? '已取消 1 张' : '上传失败 1 张 · 未创建图片'}。清空结果不会删除图片，也不会中断服务器清理。`
              : item?.state === 'saving'
                ? `${item.progress === 100 ? '文件已传输 100%。' : ''}尚未确认保存与处理结果，请稍候。`
                : '选择图片，确认本次设置后开始上传。'}
          </p>
        </div>
        <input
          ref={input}
          type="file"
          aria-label="选择图片文件"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) setError(controller.add(file) ?? '');
          }}
        />
        {!frozen ? (
          <div
            data-testid="upload-composition"
            className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6"
          >
            <Card
              data-testid="upload-picker"
              className="group/upload min-h-70 min-w-0 items-center justify-center gap-4 rounded-[20px] border border-dashed border-border bg-surface px-4 py-5 md:p-6 text-center shadow-none md:min-h-90"
            >
              <span
                aria-hidden
                className="transition-transform duration-150 ease-(--ease-out) motion-reduce:transition-none motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover/upload:-translate-y-1"
              >
                <CloudUpload size={40} />
              </span>
              <h2 className="text-[26px] font-medium">选择要上传的图片</h2>
              <p className="text-sm">
                JPEG、PNG · 单文件最大 {bytesLabel(settings.maxFileBytes)}
              </p>
              <Button
                className="min-h-12 w-36"
                isDisabled={!!item}
                onPress={choose}
              >
                选择图片
              </Button>
            </Card>
            <UploadSettingsFields
              settings={settings}
              storageId={storageId}
              visibility={visibility}
              disabled={frozen}
              onStorage={(id) => {
                setStorageId(id);
              }}
              onVisibility={setVisibility}
            />
          </div>
        ) : null}
        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {item ? (
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
        ) : (
          <p className="py-8 text-center text-sm text-muted">
            尚未选择图片，文件不会自动上传。
          </p>
        )}
      </section>
      {detailId ? (
        <LibraryDetail
          key={detailId}
          imageId={detailId}
          returnTo="/upload"
          closeLabel="返回上传页"
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
