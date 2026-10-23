import type { ReactNode } from 'react';
import { Providers } from '../../../src/components/shell/providers';
import { PrototypeProvider } from '../components/prototype-state';
import { DemoControls } from '../components/demo-controls';
import './prototype.css';

export const metadata = { title: 'Ariso · 备份与恢复交互原型' };
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="scroll-pb-28" suppressHydrationWarning>
      <body data-prototype>
        <Providers>
          <PrototypeProvider>
            {children}
            <DemoControls />
          </PrototypeProvider>
        </Providers>
      </body>
    </html>
  );
}
