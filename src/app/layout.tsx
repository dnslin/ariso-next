import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '../components/shell/providers';
import { BrandMetadata } from '../components/site/brand-metadata';
import { readSiteSettings } from '../server/site/settings';
import { brandingUrl } from '../server/site/urls';
import { getServerRuntime } from '../server/startup/server-start';
import './globals.css';

// Branding is read from the live database, never during prerendering.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  const settings = readSiteSettings(getServerRuntime().connection.db);
  return {
    description: settings?.description ?? '单用户，自托管图床。',
  };
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const settings = readSiteSettings(getServerRuntime().connection.db);
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <BrandMetadata
          name={settings?.name ?? 'Ariso'}
          faviconUrl={brandingUrl(settings?.faviconKey ?? null)}
          faviconMime={settings?.faviconMime ?? null}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
