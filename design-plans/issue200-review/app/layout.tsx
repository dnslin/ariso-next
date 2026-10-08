import type { ReactNode } from 'react';
import { PrototypeProviders } from './providers';
import '../../../src/app/globals.css';

export const metadata = { title: '上传限制 · 待批准原型' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <PrototypeProviders>{children}</PrototypeProviders>
      </body>
    </html>
  );
}
