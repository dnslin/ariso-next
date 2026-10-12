import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { Popover } from '@heroui/react/popover';
import { RouterProvider } from '@heroui/react/rac';
import {
  ChartNoAxesCombined,
  CloudUpload,
  FlaskConical,
  Folder,
  HardDrive,
  Images,
  LayoutDashboard,
  Link,
  Monitor,
  Save,
  SlidersHorizontal,
  Smartphone,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import {
  SettingsCategories,
  settingsCategories,
} from '../../../src/components/shell/settings-categories';
import { DashboardPage, AnalyticsPage } from './analytics';
import { UploadPage, TrashPage, TagsPage, SharesPage } from './collections';
import { AlbumsPage, LibraryPage } from './collection-pages';
import { CollectionProvider } from './collection-state';
import { QuickUploadDialog } from './quick-upload';
import {
  StorageListPage,
  StorageEditorPage,
  StorageReferencesPage,
  StorageMaintenancePage,
  UsagePage,
} from './storage';
import {
  Footer,
  Help,
  PageHeader,
  PrototypeContext,
  SelectField,
  usePrototype,
  type Scenario,
} from './shared';

const navigation = [
  { href: '/dashboard', label: '总览', icon: <LayoutDashboard /> },
  { href: '/upload', label: '上传', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/albums', label: '相册', icon: <Folder /> },
  { href: '/tags', label: '标签', icon: <Tags /> },
  { href: '/shares', label: '分享管理', icon: <Link /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    section: '管理',
  },
  { href: '/settings/storage', label: '存储管理', icon: <HardDrive /> },
  {
    href: '/settings/general',
    label: '站点设置',
    icon: <SlidersHorizontal />,
    activePaths: settingsCategories.map((item) => item.href),
  },
];

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}
function useLocation() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
  );
}

function getScenario(): Scenario {
  const search = new URLSearchParams(window.location.search);
  const parentSearch = window.frameElement?.hasAttribute('data-prototype-frame')
    ? new URLSearchParams(window.parent.location.search)
    : search;
  return (search.get('scenario') ||
    parentSearch.get('scenario') ||
    'empty') as Scenario;
}

function Account() {
  const { navigate } = usePrototype();
  return (
    <Popover>
      <Button
        variant="ghost"
        aria-label="账号菜单"
        className="h-auto min-h-14 w-full min-w-0 justify-start gap-3 rounded-lg px-1 py-2 group-data-[collapsed=true]/sidebar:justify-center"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-default">
          <UserRound size={18} aria-hidden />
        </span>
        <span className="grid min-w-0 gap-0.5 text-left group-data-[collapsed=true]/sidebar:hidden">
          <span className="truncate text-sm">Owner</span>
          <span className="prototype-muted text-xs">站点所有者</span>
        </span>
      </Button>
      <Popover.Content className="rounded-xl border border-border bg-surface p-2 shadow-lg">
        <Popover.Dialog aria-label="账号">
          <Button
            variant="ghost"
            className="prototype-button"
            onPress={() => navigate('/settings/account')}
          >
            <UserRound size={16} aria-hidden />
            账号与安全
          </Button>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField value={value} onChange={onChange} className="gap-2">
      <Label className="text-sm font-normal">{label}</Label>
      <Input className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base md:text-sm" />
    </TextField>
  );
}

function SettingsPage({ path }: { path: string }) {
  const { navigate, notify } = usePrototype();
  const [name, setName] = useState('Ariso');
  const [url, setUrl] = useState(
    path === '/settings/account'
      ? 'preview@example.com'
      : path === '/settings/email'
        ? 'smtp.example.com'
        : 'https://images.example.com',
  );
  const [description, setDescription] = useState('');
  const [zone, setZone] = useState(
    path === '/settings/processing'
      ? 'webp'
      : path === '/settings/email'
        ? 'starttls'
        : 'Asia/Shanghai',
  );
  let fields: ReactNode;
  if (path === '/settings/account')
    fields = (
      <>
        <h2 className="prototype-heading">账号与安全</h2>
        <Field label="显示名称" value={name} onChange={setName} />
        <Field label="邮箱" value={url} onChange={setUrl} />
        <Button
          variant="outline"
          className="prototype-button w-fit"
          onPress={() => notify('密码修改流程不在本轮原型范围内')}
        >
          修改密码
        </Button>
      </>
    );
  else if (path === '/settings/processing')
    fields = (
      <>
        <h2 className="prototype-heading">图片处理</h2>
        <SelectField
          label="默认输出格式"
          value={zone}
          onChange={setZone}
          options={[
            { id: 'webp', label: 'WebP' },
            { id: 'original', label: '保留原格式' },
          ]}
        />
        <Help label="图片处理规则">
          <p>上传时可覆盖本次处理设置。原图是否保留按站点的上传规则执行。</p>
        </Help>
      </>
    );
  else if (path === '/settings/api')
    fields = (
      <>
        <h2 className="prototype-heading">上传 API</h2>
        <p className="text-sm">暂无密钥</p>
        <Button
          variant="primary"
          className="prototype-button w-fit"
          onPress={() => notify('密钥管理不在本轮原型范围内')}
        >
          新建密钥
        </Button>
      </>
    );
  else if (path === '/settings/email')
    fields = (
      <>
        <h2 className="prototype-heading">邮件服务</h2>
        <Field label="SMTP 主机" value={url} onChange={setUrl} />
        <Field label="发件人" value={description} onChange={setDescription} />
        <SelectField
          label="加密方式"
          value={zone}
          onChange={setZone}
          options={[
            { id: 'starttls', label: 'STARTTLS' },
            { id: 'tls', label: 'TLS' },
          ]}
        />
      </>
    );
  else
    fields = (
      <>
        <h2 className="prototype-heading">基本设置</h2>
        <Field label="站点名称" value={name} onChange={setName} />
        <Field label="站点描述" value={description} onChange={setDescription} />
        <Field label="公开地址" value={url} onChange={setUrl} />
        <SelectField
          label="时区"
          value={zone}
          onChange={setZone}
          options={[
            { id: 'Asia/Shanghai', label: 'Asia/Shanghai' },
            { id: 'UTC', label: 'UTC' },
          ]}
        />
      </>
    );
  return (
    <div className="prototype-page">
      <PageHeader title="站点设置" />
      <SettingsCategories items={settingsCategories} onNavigate={navigate}>
        <div className="prototype-form grid gap-5 pt-6">{fields}</div>
      </SettingsCategories>
      <Footer>
        <Button
          variant="primary"
          className="prototype-button"
          onPress={() => notify('原型设置已保存')}
        >
          <Save size={18} aria-hidden />
          保存
        </Button>
      </Footer>
    </div>
  );
}

function Route({ location }: { location: string }) {
  const url = new URL(location, window.location.origin);
  const path = url.pathname;
  if (path === '/' || path === '/dashboard') return <DashboardPage />;
  if (path === '/upload') return <UploadPage />;
  if (path.startsWith('/library')) return <LibraryPage />;
  if (path.startsWith('/albums')) return <AlbumsPage />;
  if (path.startsWith('/tags')) return <TagsPage />;
  if (path.startsWith('/shares')) return <SharesPage />;
  if (path === '/trash') return <TrashPage />;
  if (path === '/analytics')
    return url.searchParams.get('view') === 'usage' ? (
      <UsagePage />
    ) : (
      <AnalyticsPage />
    );
  if (path === '/settings/storage') return <StorageListPage />;
  if (path.endsWith('/references')) return <StorageReferencesPage />;
  if (path.endsWith('/maintenance')) return <StorageMaintenancePage />;
  if (path.startsWith('/settings/storage/'))
    return (
      <StorageEditorPage
        isNew={path.endsWith('/new')}
        storageType={path.endsWith('/cloud') ? 's3' : 'local'}
      />
    );
  return <SettingsPage key={path} path={path} />;
}

function PrototypeApp() {
  const location = useLocation();
  const scenario = getScenario();
  const [message, setMessage] = useState('');
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setMessage(''), 3200);
  }, []);
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
    const url = new URL(location, window.location.origin);
    url.searchParams.set('scenario', scenario);
    window.parent.postMessage(
      { type: 'prototype-route', href: url.pathname + url.search },
      window.location.origin,
    );
  }, [location, scenario]);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <PrototypeContext.Provider
        value={{ scenario, navigate, notify, footerTarget }}
      >
        <RouterProvider navigate={navigate}>
          <CollectionProvider key={scenario}>
            <AdminShell
              name="Ariso"
              navigation={navigation}
              user={<Account />}
              footer={<div id="prototype-footer" ref={setFooterTarget} />}
            >
              <Route key={location} location={location} />
            </AdminShell>
            <QuickUploadDialog />
          </CollectionProvider>
        </RouterProvider>
        {message ? (
          <div className="prototype-toast" role="status">
            {message}
          </div>
        ) : null}
      </PrototypeContext.Provider>
    </ThemeProvider>
  );
}

function ReviewHarness() {
  const [mobile, setMobile] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(
    (new URLSearchParams(window.location.search).get('scenario') ||
      'empty') as Scenario,
  );
  const current = useRef(window.location.pathname + window.location.search);
  const makeSource = (href: string, state: Scenario) => {
    const url = new URL(href, window.location.origin);
    url.searchParams.set('frame', '1');
    url.searchParams.set('scenario', state);
    return url.pathname + url.search;
  };
  const [source, setSource] = useState(() =>
    makeSource(window.location.pathname + window.location.search, scenario),
  );
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== 'prototype-route'
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
        <span className="review-label">
          <FlaskConical size={16} aria-hidden />
          界面原型
        </span>
        <div className="review-segment" role="group" aria-label="数据状态">
          {(
            [
              ['empty', '空白'],
              ['sample', '有数据'],
              ['attention', '异常'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={scenario === id}
              onClick={() => {
                setScenario(id);
                const url = new URL(current.current, window.location.origin);
                url.searchParams.set('scenario', id);
                window.history.replaceState(
                  null,
                  '',
                  url.pathname + url.search,
                );
                current.current = url.pathname + url.search;
                setSource(makeSource(current.current, id));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="review-segment review-devices"
          role="group"
          aria-label="预览尺寸"
        >
          <button
            aria-label="桌面预览"
            title="桌面预览"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            <Monitor size={17} />
          </button>
          <button
            aria-label="手机预览"
            title="手机预览"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            <Smartphone size={17} />
          </button>
        </div>
      </header>
      <div className="review-stage" data-mobile={mobile}>
        <iframe data-prototype-frame title="Ariso 界面原型" src={source} />
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
document.body.dataset.prototype = 'true';
createRoot(document.getElementById('root')!).render(
  new URLSearchParams(window.location.search).has('frame') ||
    window.frameElement?.hasAttribute('data-prototype-frame') ? (
    <PrototypeApp />
  ) : (
    <ReviewHarness />
  ),
);
