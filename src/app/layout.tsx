import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { Providers } from '../components/shell/providers';
import { readSiteSettings } from '../server/site/settings';
import { brandingUrl } from '../server/site/urls';
import { getServerRuntime } from '../server/startup/server-start';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const settings = readSiteSettings(getServerRuntime().connection.db);
  return {
    title: settings?.name ?? 'Ariso',
    description: settings?.description ?? '单用户，自托管图床。',
    ...(settings?.faviconKey && {
      icons: {
        icon: [
          {
            url: brandingUrl(settings.faviconKey)!,
            type: settings.faviconMime!,
          },
        ],
      },
    }),
  };
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
