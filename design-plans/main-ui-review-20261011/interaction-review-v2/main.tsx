import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { RouterProvider } from '@heroui/react/rac';
import { Toast, ToastProvider } from '@heroui/react/toast';
import {
  ChartNoAxesCombined,
  CloudUpload,
  Folder,
  HardDrive,
  Images,
  LayoutDashboard,
  Link2,
  Monitor,
  Smartphone,
  SlidersHorizontal,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { DataProvider, type Scenario } from './state';
import { AppContext } from './ui';
import { PhotoPage, AlbumsPage, TagsPage, SharesPage } from './pages';
import { UploadPage } from './upload';
const navigation = [
  {
    href: '/dashboard',
    label: '总览',
    icon: <LayoutDashboard />,
    unavailable: true,
  },
  { href: '/upload', label: '上传', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/albums', label: '相册', icon: <Folder /> },
  { href: '/tags', label: '标签', icon: <Tags /> },
  { href: '/shares', label: '分享管理', icon: <Link2 /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    section: '管理',
    unavailable: true,
  },
  {
    href: '/settings/storage',
    label: '存储管理',
    icon: <HardDrive />,
    unavailable: true,
  },
  {
    href: '/settings/general',
    label: '站点设置',
    icon: <SlidersHorizontal />,
    unavailable: true,
  },
];
const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
const useLocation = () =>
  useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
  );
function Route({
  location,
  scenario,
}: {
  location: string;
  scenario: Scenario;
}) {
  const path = new URL(location, window.location.origin).pathname;
  const id = decodeURIComponent(path.split('/')[2] ?? '');
  if (path.startsWith('/albums')) return <AlbumsPage id={id} />;
  if (path === '/upload') return <UploadPage />;
  if (path === '/trash') return <PhotoPage trash />;
  if (path.startsWith('/shares'))
    return <SharesPage id={id} attention={scenario === 'attention'} />;
  if (path === '/tags') return <TagsPage />;
  return <PhotoPage />;
}
function App() {
  const location = useLocation();
  const scenario = (new URLSearchParams(window.location.search).get(
    'scenario',
  ) ?? 'sample') as Scenario;
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const navigate = useCallback(
    (href: string) => {
      const url = new URL(href, window.location.origin);
      url.searchParams.set('frame', '1');
      url.searchParams.set('scenario', scenario);
      window.history.pushState(null, '', url.pathname + url.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
      document.getElementById('main-content')?.scrollTo(0, 0);
    },
    [scenario],
  );
  useEffect(() => {
    window.parent.postMessage(
      { type: 'interaction-prototype-route', href: location },
      window.location.origin,
    );
  }, [location]);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <AppContext.Provider value={{ navigate, footerTarget }}>
        <RouterProvider navigate={navigate}>
          <DataProvider key={scenario} scenario={scenario}>
            <AdminShell
              name="Ariso"
              navigation={navigation}
              user={
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <UserRound size={18} />
                  </span>
                  <span className="grid gap-1 text-sm">
                    <span>Owner</span>
                    <span className="text-xs text-muted">站点所有者</span>
                  </span>
                </div>
              }
              footer={
                <div
                  id="interaction-footer"
                  className="flex w-full flex-wrap items-center justify-end gap-3"
                  ref={setFooterTarget}
                />
              }
            >
              <Route key={location} location={location} scenario={scenario} />
            </AdminShell>
          </DataProvider>
          <ToastProvider
            aria-label="操作通知"
            placement="bottom end"
            width={380}
            className="bottom-24 end-4 max-w-[calc(100vw-32px)] sm:end-7"
          >
            {({ toast: notification }) => (
              <Toast
                toast={notification}
                variant={notification.content.variant}
                className="gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <Toast.Indicator variant={notification.content.variant} />
                <Toast.Content className="min-w-0 pr-8 wrap-anywhere">
                  <Toast.Title>{notification.content.title}</Toast.Title>
                </Toast.Content>
                <Toast.CloseButton
                  aria-label="关闭通知"
                  className="size-11 border-0 bg-transparent"
                />
              </Toast>
            )}
          </ToastProvider>
        </RouterProvider>
      </AppContext.Provider>
    </ThemeProvider>
  );
}
function Harness() {
  const [mobile, setMobile] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(
    (new URLSearchParams(window.location.search).get('scenario') ??
      'sample') as Scenario,
  );
  const current = useRef(window.location.pathname + window.location.search);
  function sourceFor(href: string, state: Scenario) {
    const url = new URL(href, window.location.origin);
    url.searchParams.set('frame', '1');
    url.searchParams.set('scenario', state);
    return url.pathname + url.search;
  }
  const [source, setSource] = useState(() =>
    sourceFor(window.location.pathname + window.location.search, scenario),
  );
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== 'interaction-prototype-route'
      )
        return;
      const url = new URL(event.data.href, window.location.origin);
      url.searchParams.delete('frame');
      current.current = url.pathname + url.search;
      window.history.replaceState(null, '', current.current);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  return (
    <div className="review-harness">
      <header className="review-toolbar">
        <span className="review-label">操作减负原型</span>
        <div className="review-segment" role="group" aria-label="原型数据状态">
          {(
            [
              ['sample', '有数据'],
              ['empty', '空白'],
              ['attention', '失败重试'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={scenario === id}
              onClick={() => {
                setScenario(id);
                setSource(sourceFor(current.current, id));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="review-segment" role="group" aria-label="原型预览尺寸">
          <button
            type="button"
            aria-label="桌面预览"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            <Monitor size={17} />
          </button>
          <button
            type="button"
            aria-label="手机预览"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            <Smartphone size={17} />
          </button>
        </div>
      </header>
      <div className="review-stage" data-mobile={mobile}>
        <iframe title="Ariso 操作减负原型" data-prototype-frame src={source} />
      </div>
    </div>
  );
}
const errors: string[] = [];
Object.assign(window, { __prototypeErrors: errors });
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) =>
  errors.push(String(event.reason)),
);
document.body.dataset.interactionPrototype = 'true';
createRoot(document.getElementById('root')!).render(
  new URLSearchParams(window.location.search).has('frame') ||
    window.frameElement?.hasAttribute('data-prototype-frame') ? (
    <App />
  ) : (
    <Harness />
  ),
);
