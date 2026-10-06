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
import {
  OwnerSessionContext,
  SessionControls,
  useOwnerSession,
} from '../identity/session-controls';

// 菜单顺序来自 Figma；只开放已交付页面，未来模块不提供虚假链接。
const navigation = [
  {
    href: '/admin',
    label: '总览',
    icon: <LayoutDashboard />,
    unavailable: true,
  },
  { href: '/upload', label: '上传', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/albums', label: '相册', icon: <Folder /> },
  { href: '/tags', label: '标签', icon: <Tags /> },
  { href: '/shares', label: '分享管理', icon: <LinkIcon /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
  {
    href: '/analytics',
    label: '访问统计',
    icon: <ChartNoAxesCombined />,
    unavailable: true,
    section: '管理',
  },
  {
    href: '/settings/storage',
    label: '存储管理',
    icon: <HardDrive />,
  },
  {
    href: '/settings/processing',
    activePaths: ['/settings/account'],
    label: '站点设置',
    icon: <SlidersHorizontal />,
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
  onSessionExpire,
}: {
  name: string;
  description: string;
  email: string;
  ownerName: string;
  children: ReactNode;
  footer?: ReactNode;
  returnTo?: string;
  initialSidebarCollapsed?: boolean;
  onSessionExpire?: () => void;
}) {
  const pathname = usePathname();
  const session = useOwnerSession(returnTo ?? pathname, onSessionExpire);
  return (
    <OwnerSessionContext value={session}>
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
    </OwnerSessionContext>
  );
}
