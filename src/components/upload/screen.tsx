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
import { Images, LayoutDashboard, Trash2, Upload } from 'lucide-react';
import { AdminShell } from '../shell/admin-shell';
import { SessionControls } from '../identity/session-controls';
import { LibraryDetail } from '../library/detail';
import { DetailReadError } from '../library/read-detail';
import { bytesLabel } from '../library/detail-labels';
import { UploadController } from './controller';
import { UploadSettingsFields, type UploadSettings } from './settings';
import { UploadQueueItem } from './item';

type ScreenProps = { name: string; description: string; email: string };
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

const navigation = [
  { href: '/admin', label: '工作空间', icon: <LayoutDashboard /> },
  { href: '/upload', label: '上传图片', icon: <Upload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
];

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
  if (!query.data)
    return (
      <AdminShell
        {...props}
        navigation={navigation}
        user={
          <div className="[&_.button]:min-h-11">
            <SessionControls returnTo="/upload" />
          </div>
        }
      >
        <h1 className="mb-5 text-3xl font-medium">上传图片</h1>
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
      </AdminShell>
    );
  return <UploadWorkspace {...props} settings={query.data} client={client} />;
}

type WorkspaceProps = ScreenProps & {
  settings: UploadSettings;
  client: QueryClient;
};

function UploadWorkspace(props: WorkspaceProps) {
  const [controller, setController] = useState<UploadController | null>(null);
  useEffect(() => {
    const instance = new UploadController({
      maxFileBytes: props.settings.maxFileBytes,
      onUnauthorized: () =>
        window.location.replace('/login?reason=expired&returnTo=%2Fupload'),
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Publish the newly owned external store; each effect setup owns its own cleanup, including StrictMode.
    setController(instance);
    return () => instance.destroy();
  }, [props.settings.maxFileBytes]);
  return controller ? (
    <UploadForm {...props} controller={controller} />
  ) : (
    <p role="status">正在准备上传队列…</p>
  );
}

function UploadForm({
  settings,
  client,
  controller,
  ...props
}: WorkspaceProps & { controller: UploadController }) {
  const item = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [storageId, setStorageId] = useState(settings.defaultStorageId);
  const [storageSelected, setStorageSelected] = useState(false);
  const [visibility, setVisibility] = useState(settings.defaultVisibility);
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
  const selectedStorage = settings.storages.find(
    (s) => s.id === storageId && s.enabled,
  );
  useEffect(() => {
    if (
      !item ||
      !['saving', 'processing-queued', 'processing'].includes(item.state)
    )
      return;
    const timer = setTimeout(
      () => {
        void controller.refresh();
      },
      document.hidden ? 10000 : 2000,
    );
    return () => clearTimeout(timer);
  }, [controller, item]);
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
  function choose() {
    if (terminal) controller.clearCompleted();
    setError('');
    input.current?.click();
  }
  return (
    <AdminShell
      {...props}
      navigation={navigation}
      user={
        <div className="grid gap-3 [&_.button]:min-h-11">
          <p>{props.email}</p>
          <SessionControls returnTo="/upload" />
        </div>
      }
      footer={
        <div className="flex w-full gap-3 md:justify-end [&_.button]:min-h-12">
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
                    storageSelected ? selectedStorage.id : undefined,
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
        className="grid min-w-0 gap-5 md:gap-6 [&_.button]:min-h-11"
        aria-labelledby="upload-title"
      >
        <p className="text-xs text-muted md:text-sm">工作空间 / 上传图片</p>
        <div className="grid gap-1.5">
          <h1
            id="upload-title"
            tabIndex={-1}
            className="text-[28px] font-medium md:text-3xl"
          >
            {terminal ? '本次上传结果' : '上传图片'}
          </h1>
          <p className="text-sm">
            {terminal
              ? '清空结果不会删除图片，也不会中断服务器清理。'
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
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:gap-6">
            <Card className="min-h-60 min-w-0 items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-background p-6 text-center shadow-none md:min-h-70">
              <Upload size={40} aria-hidden />
              <h2 className="text-2xl font-medium">选择要上传的图片</h2>
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
                setStorageSelected(true);
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
    </AdminShell>
  );
}
