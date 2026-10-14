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
import {
  Folder,
  Images,
  Link2,
  Monitor,
  RotateCcw,
  Settings,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { PrototypeContext, type Mode } from './shared';
import { ShareDemo, VisitorDemo } from './share';
import { PickerDemo } from './picker';
import { SiteDemo, ProcessingDemo } from './settings';
import { ResetDemo, RecoveryDemo } from './recovery';
import { SearchDemo } from './search';
import { TrashDeleteDemo } from './trash-delete';

const flows = [
  {
    id: 'share',
    label: 'F05 分享预览',
    href: '/shares/forest',
    instruction:
      '切换已确认／停用／地址待核对；从设置页查看已保存的访客页，并确认当前编辑仍保留。',
  },
  {
    id: 'picker',
    label: 'F06 跨页选图',
    href: '/albums/forest',
    instruction:
      '打开选图，第一页选择图片后翻页；展开“已选”，逐张取消，再添加剩余图片。',
  },
  {
    id: 'zone',
    label: 'F07 时区',
    href: '/settings/general',
    instruction: '修改站点时区；搜索并选中有效时区，保存后确认显示时间的反馈。',
  },
  {
    id: 'reset',
    label: 'F08 重置结果',
    href: '/reset-password',
    instruction:
      '查看请求结果不明时的标题、说明与下一步；可进入重新申请及登录示意页。',
  },
  {
    id: 'compare',
    label: 'F09 核对差异',
    href: '/settings/processing',
    instruction:
      '修改处理设置，模拟保存响应丢失后核对；比较保存值与当前输入的中文标签、单位。',
  },
  {
    id: 'recovery',
    label: 'F10 短视口',
    href: '/forgot-password',
    instruction:
      '切到“1024×600”查看找回密码表单和返回登录是否同屏可见；手机也可操作。',
  },
  {
    id: 'search',
    label: 'F11 搜索',
    href: '/library',
    instruction:
      '在图库／回收站输入名称：仅点“搜索”或按 Enter 后提交；清除可恢复全部结果。',
  },
  {
    id: 'trash',
    label: 'F12 回收工具栏',
    href: '/trash',
    instruction:
      '切到手机查看搜索与选择入口；选择记录后检查批量操作换行和点击区。',
  },
  {
    id: 'cleanup',
    label: '永久删除流程',
    href: '/trash?flow=cleanup',
    instruction:
      '选中图片后永久删除：对照原页背景确认和结果页；展开“任务详情”核对信息，再点顶部“返回”。',
  },
] as const;
type Flow = (typeof flows)[number]['id'];
type Device = 'desktop' | 'mobile' | 'short';
const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
const useLocation = () =>
  useSyncExternalStore(subscribe, () => location.pathname + location.search);
function inferFlow(path: string): Flow {
  if (path.startsWith('/s/') || path.startsWith('/shares/')) return 'share';
  if (path.startsWith('/albums/')) return 'picker';
  if (path === '/settings/general') return 'zone';
  if (path.startsWith('/reset-password')) return 'reset';
  if (path === '/settings/processing') return 'compare';
  if (path.startsWith('/forgot-password')) return 'recovery';
  if (path === '/library') return 'search';
  if (path === '/trash') return 'trash';
  return 'share';
}

function App() {
  const href = useLocation();
  const url = new URL(href, location.origin);
  const mode: Mode =
    url.searchParams.get('mode') === 'before' ? 'before' : 'after';
  const flow =
    (url.searchParams.get('flow') as Flow) || inferFlow(url.pathname);
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const navigate = useCallback(
    (target: string) => {
      const next = new URL(target, location.origin);
      next.searchParams.set('frame', '1');
      next.searchParams.set('mode', mode);
      next.searchParams.set('flow', inferFlow(next.pathname));
      history.pushState(null, '', next.pathname + next.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
      if (next.pathname !== url.pathname)
        document.getElementById('main-content')?.scrollTo(0, 0);
    },
    [mode, url.pathname],
  );
  useEffect(() => {
    (window as Window & { __p2Navigate?: typeof navigate }).__p2Navigate =
      navigate;
  }, [navigate]);
  useEffect(() => {
    window.parent.postMessage({ type: 'p2-route', href }, location.origin);
  }, [href]);
  const content = url.pathname.startsWith('/s/') ? (
    <VisitorDemo />
  ) : flow === 'reset' ? (
    <ResetDemo />
  ) : flow === 'recovery' ? (
    <RecoveryDemo />
  ) : (
    <RouterProvider navigate={navigate}>
      <AdminShell
        name="Ariso"
        navigation={[
          {
            href: '/library',
            label: '图库',
            icon: <Images className="size-4" />,
          },
          {
            href: '/albums/forest',
            label: '相册',
            icon: <Folder className="size-4" />,
          },
          {
            href: '/shares/forest',
            label: '分享',
            icon: <Link2 className="size-4" />,
          },
          {
            href: '/trash',
            label: '回收站',
            icon: <Trash2 className="size-4" />,
          },
          {
            href: '/settings/general',
            label: '站点设置',
            icon: <Settings className="size-4" />,
            section: '管理',
            activePaths: ['/settings/processing'],
          },
        ]}
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
            id="p2-footer"
            ref={setFooterTarget}
            className="flex w-full flex-wrap items-center justify-end gap-3"
          />
        }
      >
        {flow === 'share' ? <ShareDemo /> : null}
        {flow === 'picker' ? <PickerDemo /> : null}
        {flow === 'zone' ? <SiteDemo /> : null}
        {flow === 'compare' ? <ProcessingDemo /> : null}
        {flow === 'search' || flow === 'trash' ? (
          <SearchDemo kind={flow} />
        ) : null}
        {flow === 'cleanup' ? <TrashDeleteDemo /> : null}
      </AdminShell>
    </RouterProvider>
  );
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider locale="zh-CN">
        <PrototypeContext.Provider
          value={{ mode, href, navigate, footerTarget }}
        >
          {content}
        </PrototypeContext.Provider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function Harness() {
  const initial = new URL(location.href);
  const [flow, setFlow] = useState<Flow>(
    (initial.searchParams.get('flow') as Flow) || inferFlow(initial.pathname),
  );
  const [mode, setMode] = useState<Mode>(
    initial.searchParams.get('mode') === 'before' ? 'before' : 'after',
  );
  const [device, setDevice] = useState<Device>(
    initial.searchParams.get('device') === 'mobile'
      ? 'mobile'
      : innerWidth < 768
        ? 'mobile'
        : 'desktop',
  );
  const initialHref =
    initial.pathname === '/'
      ? flows[0].href
      : initial.pathname + initial.search;
  const current = useRef(initialHref);
  const sourceOf = (href: string, nextMode: Mode, nextFlow: Flow) => {
    const next = new URL(href, location.origin);
    ['device', 'reset'].forEach((key) => next.searchParams.delete(key));
    next.searchParams.set('frame', '1');
    next.searchParams.set('mode', nextMode);
    next.searchParams.set('flow', nextFlow);
    return next.pathname + next.search;
  };
  const [source, setSource] = useState(() => sourceOf(initialHref, mode, flow));
  const [reset, setReset] = useState(0);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.type !== 'p2-route')
        return;
      const next = new URL(event.data.href, location.origin);
      next.searchParams.delete('frame');
      current.current = next.pathname + next.search;
      history.replaceState(null, '', current.current);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  const active = flows.find((item) => item.id === flow)!;
  return (
    <div className="p2-harness">
      <header className="p2-toolbar">
        <div className="p2-toolbar-top">
          <strong>P2 交互原型</strong>
          <div className="p2-controls" role="group" aria-label="方案对照">
            {(['before', 'after'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setSource(sourceOf(current.current, value, flow));
                }}
              >
                {value === 'before' ? '现状' : '优化方案'}
              </button>
            ))}
          </div>
          <div className="p2-controls" role="group" aria-label="预览尺寸">
            <button
              aria-pressed={device === 'desktop'}
              onClick={() => setDevice('desktop')}
            >
              <Monitor size={17} />
              桌面
            </button>
            <button
              aria-pressed={device === 'mobile'}
              onClick={() => setDevice('mobile')}
            >
              <Smartphone size={17} />
              手机
            </button>
            <button
              aria-pressed={device === 'short'}
              onClick={() => setDevice('short')}
            >
              1024×600
            </button>
          </div>
          <button
            aria-label="重新开始当前流程"
            onClick={() => {
              current.current = active.href;
              setSource(sourceOf(active.href, mode, flow));
              setReset((value) => value + 1);
            }}
          >
            <RotateCcw size={16} />
            重置
          </button>
        </div>
        <div className="p2-flow-tabs" role="group" aria-label="P2 流程">
          {flows.map((item) => (
            <button
              key={item.id}
              aria-pressed={flow === item.id}
              onClick={() => {
                setFlow(item.id);
                current.current = item.href;
                setSource(sourceOf(item.href, mode, item.id));
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="p2-instruction">
          {active.instruction} 数据和保存均为本地模拟，不会修改产品。
        </p>
      </header>
      <div className="p2-stage" data-device={device}>
        <iframe
          key={reset}
          title="Ariso P2 交互原型"
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
