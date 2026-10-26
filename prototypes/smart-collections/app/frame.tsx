'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Dropdown, Label, Link, Separator } from '@heroui/react';
import {
  ChartNoAxesCombined,
  CloudUpload,
  Code2,
  Folder,
  HardDrive,
  Images,
  LayoutDashboard,
  Link as LinkIcon,
  MoreHorizontal,
  RotateCcw,
  SlidersHorizontal,
  Tags,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { useDemo } from './providers';

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
    label: '存储',
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
const scenarios = [
  ['normal', '正常使用'],
  ['empty', '集合没有匹配图片'],
  ['save-error', '保存失败一次'],
  ['stale-tag', '截图标签已删除'],
  ['loading', '正在加载'],
  ['backfill', '旧图库指纹补齐中'],
  ['upload-error', '上传失败'],
  ['api', 'API / PicGo 重复错误'],
];
export function PrototypeFrame({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { scenario, setScenario, reset } = useDemo();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="prototype-stage h-dvh overflow-hidden">
      <div
        className="flex h-11 items-center justify-between gap-2 border-b border-border bg-default/50 px-3 text-xs sm:px-5"
        aria-label="原型演示工具"
      >
        <span className="shrink-0 font-medium">
          交互原型
          <span className="hidden text-muted sm:inline"> · 示例数据</span>
        </span>
        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          <Link
            href="/library/collections/untagged"
            className={`min-h-11 px-2 text-xs ${pathname.startsWith('/library') ? 'font-semibold' : ''}`}
          >
            智能集合
          </Link>
          <Link
            href="/upload"
            className={`min-h-11 px-2 text-xs ${pathname.startsWith('/upload') ? 'font-semibold' : ''}`}
          >
            重复上传
          </Link>
          <Dropdown>
            <Button
              isIconOnly
              variant="ghost"
              className="size-11 shrink-0"
              aria-label="演示场景"
            >
              <MoreHorizontal size={18} />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="演示场景"
                onAction={(key) => {
                  if (key === 'reset') {
                    reset();
                    router.push('/library/collections/untagged');
                    return;
                  }
                  const value = String(key);
                  setScenario(value);
                  if (['api', 'backfill', 'upload-error'].includes(value))
                    router.push('/upload');
                }}
                selectionMode="single"
                selectedKeys={[scenario]}
              >
                {scenarios.map(([id, label]) => (
                  <Dropdown.Item id={id} key={id} textValue={label}>
                    <Label>{label}</Label>
                    <Dropdown.ItemIndicator />
                  </Dropdown.Item>
                ))}
                <Separator />
                <Dropdown.Item id="reset" textValue="重置演示">
                  <RotateCcw size={16} />
                  <Label>重置演示</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </div>
      <AdminShell
        name="Ariso"
        navigation={navigation}
        user={
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-default">
              <UserRound size={17} />
            </span>
            <div>
              <p className="text-sm">Owner</p>
              <p className="text-xs text-muted">站点所有者</p>
            </div>
          </div>
        }
        footer={footer}
      >
        {children}
      </AdminShell>
    </div>
  );
}

export function PrototypeBoundary() {
  return (
    <p className="flex items-center gap-2 text-xs text-muted">
      <Code2 size={14} aria-hidden />
      示例响应，不连接真实接口
    </p>
  );
}
