import type { ReactNode } from 'react';
import { Providers } from '../../../src/components/shell/providers';
import './style.css';

export const metadata = { title: 'Ariso · 品牌交互提案' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
