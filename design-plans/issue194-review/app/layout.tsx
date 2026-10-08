import type { ReactNode } from 'react';
import { Providers } from '../../../src/components/shell/providers';
import './prototype.css';
export const metadata = { title: 'Ariso · 基本设置交互原型' };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
