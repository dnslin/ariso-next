import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, useTheme } from 'next-themes';
import { Button } from '@heroui/react/button';
import { Link as PublicLink } from '@heroui/react/link';
import {
  LayoutDashboard,
  CloudUpload,
  Images,
  Folder,
  Tags,
  Link,
  Trash2,
  ChartNoAxesCombined,
  HardDrive,
  SlidersHorizontal,
} from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminShell } from '../../src/components/shell/admin-shell';

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
    section: '管理',
    icon: <ChartNoAxesCombined />,
  },
  { href: '/settings/storage', label: '存储管理', icon: <HardDrive /> },
  { href: '/settings/general', label: '站点设置', icon: <SlidersHorizontal /> },
];
function User() {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 group-data-[collapsed=true]/sidebar:flex-col">
      <Button
        variant="ghost"
        aria-label="账号菜单"
        className="h-auto min-h-14 min-w-0 flex-1 justify-start gap-3 rounded-lg px-1 py-2 text-left group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-default text-sm"
          aria-hidden
        >
          O
        </span>
        <span className="grid min-w-0 gap-0.5 group-data-[collapsed=true]/sidebar:hidden">
          <span className="truncate text-sm font-normal">Owner</span>
          <span className="text-xs font-normal">站点所有者</span>
        </span>
      </Button>
    </div>
  );
}
const stats = [
  ['图片数量', '2', '回收站 0 张'],
  ['相册数量', '1', '包含空相册'],
  ['今日访问', '21', '截至本次统计更新'],
  ['累计访问', '21', '历史累计访问'],
];
const series = [
  '10/04',
  '10/05',
  '10/06',
  '10/07',
  '10/08',
  '10/09',
  '10/10',
].map((day, index) => ({ day, value: index === 6 ? 21 : 0 }));
function Dashboard() {
  const [days, setDays] = useState(7);
  return (
    <AdminShell
      name="Ariso"
      navigation={navigation}
      user={<User />}
      footer={
        <>
          <Button
            variant="outline"
            className="h-12 min-w-0 flex-1 rounded-lg sm:flex-none sm:w-50"
          >
            上传图片
          </Button>
          <Button
            variant="outline"
            className="h-12 min-w-0 flex-1 rounded-lg sm:flex-none sm:w-50"
          >
            查看访问统计
          </Button>
        </>
      }
    >
      <div className="grid gap-6">
        <header className="grid gap-5">
          <h1>工作台</h1>
          <p className="text-sm">每一张图片，都有自己的位置。</p>
        </header>
        <div className="grid gap-2 text-sm text-muted">
          <p>Asia/Shanghai · 今日截至本次统计更新。</p>
          <p>交互原型 · 示例数据</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map(([label, value, note]) => (
            <section
              key={label}
              className="grid gap-3 rounded-[20px] border border-border bg-surface p-5"
            >
              <h2 className="text-sm font-normal">{label}</h2>
              <p className="text-[32px]">{value}</p>
              <p className="text-xs">{note}</p>
            </section>
          ))}
        </div>
        <div className="flex gap-3">
          {[7, 30, 90].map((value) => (
            <Button
              key={value}
              variant={days === value ? 'primary' : 'outline'}
              className="h-11 min-w-0 flex-1 rounded-lg sm:flex-none sm:w-26"
              onPress={() => setDays(value)}
            >
              {value} 天
            </Button>
          ))}
        </div>
        <section className="grid gap-4 rounded-[20px] border border-border bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-medium">公开访问趋势</h2>
          <p className="text-sm">2026-10-04—2026-10-10 · 21 次</p>
          <div className="h-60 w-full" aria-label="原型示例趋势">
            <ResponsiveContainer>
              <LineChart
                data={series}
                margin={{ top: 16, right: 12, bottom: 0, left: -16 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 24]}
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                />
                <Line
                  dataKey="value"
                  type="linear"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted">单位：次 · 今日未结束。</p>
          <Button variant="outline" className="min-h-11 w-full rounded-lg">
            查看每日数值
          </Button>
        </section>
      </div>
    </AdminShell>
  );
}
function App() {
  const { resolvedTheme } = useTheme();
  if (location.pathname === '/public')
    return (
      <main className="public-shell">
        <div className="public-decoration" aria-hidden />
        <div className="public-content">
          <div className="grid justify-items-center gap-6">
            <h1 className="shell-brand text-[72px]">Ariso</h1>
            <p>图片，自在收纳。</p>
            <PublicLink href="/" className="text-sm text-muted">
              返回后台原型
            </PublicLink>
            <p className="text-xs text-muted">前台预览 · 无外观入口</p>
          </div>
        </div>
      </main>
    );
  return (
    <div data-resolved-theme={resolvedTheme}>
      <Dashboard />
    </div>
  );
}
// Prototype navigation is illustrative; the public preview is a separate route.
document.addEventListener('click', (event) => {
  const link = (event.target as Element).closest('a');
  if (link && !['/', '/public'].includes(link.getAttribute('href') ?? ''))
    event.preventDefault();
});
createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <App />
  </ThemeProvider>,
);
