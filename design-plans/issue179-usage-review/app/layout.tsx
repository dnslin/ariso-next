import type { ReactNode } from 'react';
import './style.css';

export const metadata = { title: 'Ariso · 存储占用精简原型' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
