import type { ReactNode } from 'react';
import { PrototypeProviders } from './providers';
import '../../../../src/app/globals.css';
import './preview.css';

export const metadata = { title: 'Ariso · 访问防护交互原型' };
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <PrototypeProviders>{children}</PrototypeProviders>
      </body>
    </html>
  );
}
