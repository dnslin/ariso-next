import type { ReactNode } from 'react';
import { DemoProviders } from './providers';
import { Prototype } from './prototype';
import './preview.css';

export const metadata = { title: 'Ariso · 智能集合与重复检测原型' };
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="[&_.button--primary]:rounded-lg [&_.button--secondary]:rounded-lg [&_.button--secondary]:text-foreground">
        <DemoProviders>
          <Prototype />
          {children}
        </DemoProviders>
      </body>
    </html>
  );
}
