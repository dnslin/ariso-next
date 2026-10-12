import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { I18nProvider } from 'react-aria';
import { RouterProvider } from '@heroui/react/rac';
import { Toast, ToastProvider } from '@heroui/react/toast';
import {
  ChartNoAxesCombined,
  Link2,
  Monitor,
  SlidersHorizontal,
  Smartphone,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { AppContext, type Scenario } from './ui';
import { TagsPage } from './tags';
import { ShareSettingsPage, SharesPage } from './shares';
import { TrashPage } from './trash';
import { AnalyticsPage } from './analytics';
import { BrandingPage, SettingsPage } from './settings';

const routes = [
  { href: '/tags', label: '标签', icon: <Tags /> },
  { href: '/shares', label: '分享', icon: <Link2 /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    section: '管理',
  },
  { href: '/settings/general', label: '站点设置', icon: <SlidersHorizontal /> },
];
const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
const useLocation = () =>
  useSyncExternalStore(subscribe, () => location.pathname + location.search);
function Route({ path }: { path: string }) {
  if (path === '/tags') return <TagsPage />;
  if (path === '/trash') return <TrashPage />;
  if (path === '/analytics') return <AnalyticsPage />;
  if (path === '/settings/general/branding') return <BrandingPage />;
  if (path === '/settings/general') return <SettingsPage />;
  if (path.startsWith('/shares/')) return <ShareSettingsPage />;
  return <SharesPage />;
}
function App() {
  const current = useLocation();
  const path = new URL(current, location.origin).pathname;
  const scenario = (new URLSearchParams(location.search).get('scenario') ??
    'normal') as Scenario;
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const navigate = useCallback(
    (href: string) => {
      const url = new URL(href, location.origin);
      url.searchParams.set('frame', '1');
      url.searchParams.set('scenario', scenario);
      window.history.pushState(null, '', url.pathname + url.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
      if (url.pathname !== path)
        document.getElementById('main-content')?.scrollTo(0, 0);
    },
    [scenario, path],
  );
  useEffect(() => {
    window.parent.postMessage(
      { type: 'clarity-route', href: current },
      location.origin,
    );
  }, [current]);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider locale="zh-CN">
        <AppContext.Provider value={{ navigate, footerTarget, scenario }}>
          <RouterProvider navigate={navigate}>
            <AdminShell
              name="Ariso"
              navigation={routes}
              user={
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
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
                  id="clarity-footer"
                  ref={setFooterTarget}
                  className="flex w-full flex-wrap items-center justify-end gap-3"
                />
              }
            >
              <Route key={`${path}:${scenario}`} path={path} />
            </AdminShell>
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
      </I18nProvider>
    </ThemeProvider>
  );
}
function Harness() {
  const [mobile, setMobile] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(
    (new URLSearchParams(location.search).get('scenario') ??
      'normal') as Scenario,
  );
  const current = useRef(location.pathname + location.search);
  const sourceFor = (href: string, value: Scenario) => {
    const url = new URL(href, location.origin);
    url.searchParams.set('frame', '1');
    url.searchParams.set('scenario', value);
    return url.pathname + url.search;
  };
  const [source, setSource] = useState(() =>
    sourceFor(location.pathname + location.search, scenario),
  );
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.data?.type !== 'clarity-route'
      )
        return;
      const url = new URL(event.data.href, location.origin);
      url.searchParams.delete('frame');
      current.current = url.pathname + url.search;
      history.replaceState(null, '', current.current);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  return (
    <div className="review-harness">
      <header className="review-toolbar">
        <span className="review-label">清晰设计 · 第三版</span>
        <div role="group" aria-label="原型状态" className="review-segment">
          {(
            [
              ['normal', '正常'],
              ['slow', '慢请求'],
              ['error', '失败'],
              ['empty', '空白'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={scenario === value}
              onClick={() => {
                setScenario(value);
                setSource(sourceFor(current.current, value));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="预览尺寸" className="review-segment">
          <button
            aria-label="桌面预览"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            <Monitor size={17} />
          </button>
          <button
            aria-label="手机预览"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            <Smartphone size={17} />
          </button>
        </div>
      </header>
      <div className="review-stage" data-mobile={mobile}>
        <iframe title="Ariso 清晰设计原型" data-prototype-frame src={source} />
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
document.body.dataset.clarityPrototype = 'true';
createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('frame') ||
    window.frameElement?.hasAttribute('data-prototype-frame') ? (
    <App />
  ) : (
    <Harness />
  ),
);
