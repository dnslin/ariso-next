'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CloudUpload, Images, LayoutDashboard, Trash2 } from 'lucide-react';
import { AdminShell } from './admin-shell';
import { SessionControls, useOwnerSession } from '../identity/session-controls';

// 所有真实后台页面共享入口和图标；未来入口的呈现策略仍待设计确认。
const navigation = [
  { href: '/admin', label: '工作空间', icon: <LayoutDashboard /> },
  { href: '/upload', label: '上传图片', icon: <CloudUpload /> },
  { href: '/library', label: '图库', icon: <Images /> },
  { href: '/trash', label: '回收站', icon: <Trash2 /> },
];

export function OwnerShell({
  name,
  description,
  email,
  ownerName,
  children,
  footer,
  returnTo,
}: {
  name: string;
  description: string;
  email: string;
  ownerName: string;
  children: ReactNode;
  footer?: ReactNode;
  returnTo?: string;
}) {
  const pathname = usePathname();
  const session = useOwnerSession(returnTo ?? pathname);
  return (
    <AdminShell
      name={name}
      description={description}
      navigation={navigation}
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
