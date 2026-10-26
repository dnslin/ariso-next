'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dropdown, Label, Separator } from '@heroui/react';
import {
  CloudUpload,
  Images,
  Folder,
  Tags,
  Link,
  Trash2,
  ChartNoAxesCombined,
  HardDrive,
  SlidersHorizontal,
  LayoutDashboard,
  MoreHorizontal,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import { AdminShell } from '../../../src/components/shell/admin-shell';
import { useDemo } from './store';

const navigation = [
  {
    href: '/dashboard',
    label: '总览',
    icon: <LayoutDashboard />,
    unavailable: true,
  },
  { href: '/upload', label: '上传', icon: <CloudUpload />, unavailable: true },
  {
    href: '/library',
    label: '图库',
    icon: <Images />,
    activePaths: ['/', '/editor', '/templates', '/batch', '/results'],
  },
  { href: '/albums', label: '相册', icon: <Folder />, unavailable: true },
  { href: '/tags', label: '标签', icon: <Tags />, unavailable: true },
  { href: '/shares', label: '分享', icon: <Link />, unavailable: true },
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
  {
    href: '/settings/general',
    label: '站点设置',
    icon: <SlidersHorizontal />,
    unavailable: true,
  },
];
export function Frame({ children }: { children: ReactNode }) {
  const demo = useDemo();
  const router = useRouter();
  return (
    <div className="image-editor-prototype h-dvh overflow-hidden">
      <div
        className="flex h-10 items-center justify-between gap-2 border-b border-border bg-default/50 px-3 text-xs sm:px-5"
        aria-label="原型演示工具"
      >
        <span className="shrink-0 font-medium">
          交互原型
          <span className="ml-2 hidden font-normal text-muted sm:inline">
            编辑真实生效 · 保存为本页演示
          </span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-10 rounded-lg px-2 text-xs"
            onPress={() => demo.openEditor('account')}
          >
            单张编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10 rounded-lg px-2 text-xs"
            onPress={() => router.push('/templates')}
          >
            模板
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10 rounded-lg px-2 text-xs"
            onPress={() => {
              demo.setSelectedIds(['account', 'profile', 'receipt']);
              router.push('/batch');
            }}
          >
            批量
          </Button>
          <Dropdown>
            <Button
              size="sm"
              isIconOnly
              variant="ghost"
              aria-label="演示场景"
              className="size-10"
            >
              <MoreHorizontal size={17} />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="演示场景"
                selectionMode="single"
                selectedKeys={[demo.scenario]}
                onAction={(key) => {
                  if (key === 'reset') demo.reset();
                  else {
                    demo.setScenario(String(key));
                    demo.resetFailure();
                  }
                }}
              >
                <Dropdown.Item id="normal" textValue="正常保存">
                  <Label>正常保存</Label>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
                <Dropdown.Item id="save-error" textValue="保存失败一次">
                  <Label>保存失败一次</Label>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
                <Separator />
                <Dropdown.Item
                  id="reset"
                  textValue="重置演示"
                  isDisabled={demo.saving}
                >
                  <RotateCcw size={15} />
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
      >
        {children}
      </AdminShell>
    </div>
  );
}
