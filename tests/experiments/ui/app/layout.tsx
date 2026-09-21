import type { ReactNode } from 'react';
import { Providers } from './providers';
import './style.css';

export const metadata = { title: 'EV-UI-01 · 依赖验证' };
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
