import type { ReactNode } from 'react';
import { Providers } from '../../../../src/components/shell/providers';
import '../../../../src/app/globals.css';

export const metadata = { title: 'Ariso · Shell verification' };
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
