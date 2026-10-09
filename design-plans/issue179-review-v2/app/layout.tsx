import type { ReactNode } from 'react';
import './style.css';

export const metadata = { title: 'Ariso · 统计原型 02' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
