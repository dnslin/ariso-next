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
  Folder,
  HardDrive,
  Link2,
  Monitor,
  RotateCcw,
  Settings,
  Smartphone,
  Upload,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { PrototypeContext, type Mode, type Scenario } from './shared';
import { SettingsDemo } from './settings';
import { CollectionsDemo } from './collections';
import { UploadDemo } from './upload';
import { StorageDemo } from './storage';

const demos = [
  {
    id: 'edit',
    label: '编辑保护',
    href: '/settings/processing',
    instruction:
      '修改压缩质量或邮件主机，然后切换设置分类；试试继续编辑、放弃修改和保存。',
  },
  {
    id: 'return',
    label: '返回位置',
    href: '/albums',
    instruction:
      '搜索“旅行”并翻页，打开相册或分享设置，再返回；检查搜索、页码、滚动和焦点。',
  },
  {
    id: 'upload',
    label: '上传设置',
    href: '/upload',
    instruction:
      '切到手机查看 12 张队列；从顶部修改本次设置，开始上传后再修改下一次设置。',
  },
  {
    id: 'storage',
    label: '引用跳转',
    href: '/settings/storage/archive?view=references',
    instruction:
      '查看图库、回收记录和处理任务的入口；重处理中的图片仍可保持“已就绪”。',
  },
] as const;
type Demo = (typeof demos)[number]['id'];
const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
const useLocation = () =>
  useSyncExternalStore(subscribe, () => location.pathname + location.search);
const paramsOf = (href: string) => new URL(href, location.origin).searchParams;
function inferDemo(path: string, fallback: Demo): Demo {
  if (
    path.startsWith('/settings/storage') ||
    path === '/library' ||
    path === '/trash'
  )
    return 'storage';
  if (path.startsWith('/settings/')) return 'edit';
  if (path.startsWith('/albums') || path.startsWith('/shares')) return 'return';
  if (path === '/upload') return 'upload';
  return fallback;
}

function App() {
  const href = useLocation();
  const params = paramsOf(href);
  const mode = (params.get('mode') ?? 'after') as Mode;
  const scenario = (params.get('scenario') ?? 'normal') as Scenario;
  const demo = (params.get('demo') ??
    inferDemo(location.pathname, 'edit')) as Demo;
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const navigate = useCallback(
    (target: string, replace = false) => {
      const url = new URL(
        target === '/' ? demos.find((item) => item.id === demo)!.href : target,
        location.origin,
      );
      url.searchParams.set('frame', '1');
      url.searchParams.set('mode', mode);
      url.searchParams.set('scenario', scenario);
      url.searchParams.set('demo', inferDemo(url.pathname, demo));
      const next = url.pathname + url.search + url.hash;
      window.history[replace ? 'replaceState' : 'pushState'](null, '', next);
      window.dispatchEvent(new PopStateEvent('popstate'));
      if (url.pathname !== new URL(href, location.origin).pathname)
        document.getElementById('main-content')?.scrollTo(0, 0);
    },
    [mode, scenario, demo, href],
  );
  Object.assign(window, { __p1Navigate: navigate });
  useEffect(() => {
    window.parent.postMessage({ type: 'p1-route', href }, location.origin);
  }, [href]);
  const navigation = [
    { href: '/upload', label: '上传', icon: <Upload className="size-4" /> },
    { href: '/albums', label: '相册', icon: <Folder className="size-4" /> },
    { href: '/shares', label: '分享', icon: <Link2 className="size-4" /> },
    {
      href: '/settings/storage/archive?view=references',
      label: '存储',
      icon: <HardDrive className="size-4" />,
      section: '管理',
      activePaths: ['/settings/storage/archive', '/library', '/trash'],
    },
    {
      href: '/settings/processing',
      label: '站点设置',
      icon: <Settings className="size-4" />,
      activePaths: ['/settings/email', '/settings/general'],
    },
  ];
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider locale="zh-CN">
        <PrototypeContext.Provider
          value={{ mode, scenario, href, navigate, footerTarget }}
        >
          <RouterProvider navigate={(target) => navigate(target)}>
            <AdminShell
              name="Ariso"
              navigation={navigation}
              user={
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-default text-sm">
                    O
                  </span>
                  <span className="grid gap-1 text-sm">
                    <span>Owner</span>
                    <span className="text-xs text-muted">站点所有者</span>
                  </span>
                </div>
              }
              footer={
                <div
                  id="p1-footer"
                  ref={setFooterTarget}
                  className="flex w-full flex-wrap items-center justify-end gap-3"
                />
              }
            >
              {demo === 'edit' ? (
                <SettingsDemo />
              ) : demo === 'return' ? (
                <CollectionsDemo />
              ) : demo === 'upload' ? (
                <UploadDemo />
              ) : (
                <StorageDemo />
              )}
            </AdminShell>
          </RouterProvider>
          <ToastProvider
            aria-label="操作通知"
            placement="bottom end"
            width={420}
            className="bottom-24 end-4 max-w-[calc(100vw-32px)] sm:end-7"
          >
            {({ toast: notification }) => (
              <Toast
                toast={notification}
                variant={notification.content.variant}
                className="gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <Toast.Indicator variant={notification.content.variant} />
                <Toast.Content className="min-w-0 pr-8 wrap-anywhere">
                  <Toast.Title>{notification.content.title}</Toast.Title>
                  <Toast.Description>
                    {notification.content.description}
                  </Toast.Description>
                </Toast.Content>
                <Toast.CloseButton
                  aria-label="关闭通知"
                  className="size-11 border-0 bg-transparent"
                />
              </Toast>
            )}
          </ToastProvider>
        </PrototypeContext.Provider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function Harness() {
  const initial = new URL(location.href);
  const [demo, setDemo] = useState<Demo>(
    (initial.searchParams.get('demo') as Demo) ??
      inferDemo(initial.pathname, 'edit'),
  );
  const [mode, setMode] = useState<Mode>(
    (initial.searchParams.get('mode') as Mode) ?? 'after',
  );
  const [scenario, setScenario] = useState<Scenario>(
    (initial.searchParams.get('scenario') as Scenario) ?? 'normal',
  );
  const [mobile, setMobile] = useState(
    initial.searchParams.get('device') === 'mobile' || innerWidth < 768,
  );
  const initialHref =
    initial.pathname === '/'
      ? demos[0].href
      : initial.pathname + initial.search;
  const current = useRef(initialHref);
  const makeSource = (
    href: string,
    nextMode: Mode,
    nextScenario: Scenario,
    nextDemo: Demo,
  ) => {
    const url = new URL(href, location.origin);
    for (const key of ['device', 'reset']) url.searchParams.delete(key);
    url.searchParams.set('frame', '1');
    url.searchParams.set('mode', nextMode);
    url.searchParams.set('scenario', nextScenario);
    url.searchParams.set('demo', nextDemo);
    return url.pathname + url.search;
  };
  const [source, setSource] = useState(() =>
    makeSource(initialHref, mode, scenario, demo),
  );
  const [reset, setReset] = useState(0);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.type !== 'p1-route')
        return;
      const url = new URL(event.data.href, location.origin);
      url.searchParams.delete('frame');
      current.current = url.pathname + url.search;
      const nextDemo = url.searchParams.get('demo') as Demo;
      if (nextDemo) setDemo(nextDemo);
      history.replaceState(null, '', current.current);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  const active = demos.find((item) => item.id === demo)!;
  return (
    <div className="p1-harness">
      <header className="p1-toolbar">
        <strong>P1 交互原型</strong>
        <div className="p1-controls" role="group" aria-label="评审流程">
          {demos.map((item) => (
            <button
              key={item.id}
              aria-pressed={demo === item.id}
              onClick={() => {
                setDemo(item.id);
                current.current = item.href;
                setSource(makeSource(item.href, mode, scenario, item.id));
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="p1-controls" role="group" aria-label="方案对照">
          {(
            [
              ['before', '现状'],
              ['after', '优化方案'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setSource(makeSource(current.current, value, scenario, demo));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p1-controls" role="group" aria-label="预览尺寸">
          <button
            aria-label="桌面预览"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            <Monitor size={17} />
            桌面
          </button>
          <button
            aria-label="手机预览"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            <Smartphone size={17} />
            手机
          </button>
        </div>
        <label className="p1-controls">
          请求状态
          <select
            aria-label="模拟请求状态"
            value={scenario}
            onChange={(event) => {
              const next = event.target.value as Scenario;
              setScenario(next);
              setSource(makeSource(current.current, mode, next, demo));
            }}
          >
            <option value="normal">正常</option>
            <option value="slow">慢请求</option>
            <option value="error">已知失败</option>
            <option value="unknown">结果待核对</option>
          </select>
        </label>
        <button
          aria-label="重新开始当前流程"
          onClick={() => {
            current.current = active.href;
            setSource(makeSource(active.href, mode, scenario, demo));
            setReset((value) => value + 1);
          }}
        >
          <RotateCcw size={16} />
          重置
        </button>
        <p className="p1-instruction">
          {active.instruction} 数据与请求均为本地演示，不会修改产品。
        </p>
      </header>
      <div className="p1-stage" data-mobile={mobile}>
        <iframe
          key={reset}
          title="Ariso P1 交互原型"
          data-prototype-frame
          src={source}
        />
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
createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('frame') ? <App /> : <Harness />,
);
