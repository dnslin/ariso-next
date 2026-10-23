'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import {
  Archive,
  ChartNoAxesCombined,
  CloudUpload,
  Folder,
  HardDrive,
  Images,
  LayoutDashboard,
  Link as LinkIcon,
  PauseCircle,
  SlidersHorizontal,
  Tags,
  Trash2,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../../../src/components/shell/settings-categories';
import { usePrototype } from './prototype-state';

const navigation = [
  {
    href: '/dashboard',
    label: '总览',
    icon: <LayoutDashboard />,
    unavailable: true,
  },
  { href: '/upload', label: '上传', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/albums', label: '相册', icon: <Folder />, unavailable: true },
  { href: '/tags', label: '标签', icon: <Tags />, unavailable: true },
  { href: '/shares', label: '分享', icon: <LinkIcon />, unavailable: true },
  { href: '/trash', label: '回收站', icon: <Trash2 />, unavailable: true },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    section: '管理',
    unavailable: true,
  },
  {
    href: '/settings/storage',
    label: '存储',
    icon: <HardDrive />,
    unavailable: true,
  },
  { href: '/settings/backup', label: '站点设置', icon: <SlidersHorizontal /> },
];
const categories = [
  ...settingsCategories,
  {
    href: '/settings/backup',
    label: '备份与恢复',
    icon: <Archive className="size-4" aria-hidden />,
  },
];

export function AdminFrame({
  children,
  footer,
  settings = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  settings?: boolean;
}) {
  const { paused } = usePrototype();
  const router = useRouter();
  const [notice, setNotice] = useState('');
  return (
    <AdminShell
      name="Ariso"
      navigation={navigation}
      user={
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-default text-sm font-medium">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">演示所有者</p>
            <p className="text-xs text-muted">交互原型 · 模拟数据</p>
          </div>
        </div>
      }
      footer={footer}
    >
      {paused ? (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-accent/10 p-4 text-sm"
        >
          <PauseCircle className="size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">正在创建备份，暂时无法修改内容</p>
            <p className="mt-1 text-xs text-muted">
              图片浏览与外链访问不受影响，备份结束后自动恢复。
            </p>
          </div>
          <Link
            href="/settings/backup"
            className="min-h-11 text-sm font-medium"
          >
            查看备份进度
          </Link>
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
        >
          {notice}
          <Button variant="ghost" size="sm" onPress={() => setNotice('')}>
            知道了
          </Button>
        </div>
      ) : null}
      {settings ? (
        <div className="grid gap-6">
          <SettingsHeading />
          <SettingsCategories
            items={categories}
            onNavigate={(href) =>
              href === '/settings/backup'
                ? router.push(href)
                : setNotice('此分类不在本次备份与恢复原型的演示范围内。')
            }
          >
            {children}
          </SettingsCategories>
        </div>
      ) : (
        children
      )}
    </AdminShell>
  );
}
