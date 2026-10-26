import type { ReactNode } from 'react';
import './preview.css';

export const metadata = { title: 'Ariso · 浏览器插件交互原型' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
