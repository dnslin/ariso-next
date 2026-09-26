'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ChartNoAxesCombined,
  CloudUpload,
  Folder,
  HardDrive,
  Images,
  LayoutDashboard,
  Link as LinkIcon,
  SlidersHorizontal,
  Tags,
  Trash2,
} from 'lucide-react';
import { AdminShell } from './admin-shell';
import { SessionControls, useOwnerSession } from '../identity/session-controls';

// 菜单顺序来自 Figma；只开放已交付页面，未来模块不提供虚假链接。
const navigation = [
  {
    href: '/admin',
    label: '总览',
    icon: <LayoutDashboard />,
    unavailable: true,
  },
  { href: '/upload', label: '上传图片', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/albums', label: '相册', icon: <Folder />, unavailable: true },
  { href: '/tags', label: '标签', icon: <Tags />, unavailable: true },
  { href: '/shares', label: '分享管理', icon: <LinkIcon />, unavailable: true },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    unavailable: true,
    section: '管理',
  },
  {
    href: '/storage',
    label: '存储管理',
    icon: <HardDrive />,
    unavailable: true,
  },
  {
    href: '/settings',
    label: '站点设置',
    icon: <SlidersHorizontal />,
    unavailable: true,
  },
];

export function OwnerShell({
  name,
  description,
  email,
  ownerName,
  children,
  footer,
  returnTo,
  initialSidebarCollapsed,
}: {
  name: string;
  description: string;
  email: string;
  ownerName: string;
  children: ReactNode;
  footer?: ReactNode;
  returnTo?: string;
  initialSidebarCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const session = useOwnerSession(returnTo ?? pathname);
  return (
    <AdminShell
      name={name}
      description={description}
      navigation={navigation}
      initialSidebarCollapsed={initialSidebarCollapsed}
      user={
        <SessionControls
          session={session}
          account={{ name: ownerName, email }}
        />
      }
      footer={footer}
    >
      {children}
    </AdminShell>
  );
}
