import type { ReactNode } from 'react';
import { Link } from '@heroui/react/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeSelector } from '../site/theme-selector';

export function PublicShell({
  children,
  home = false,
  layout,
}: {
  children: ReactNode;
  home?: boolean;
  layout?: 'login' | 'setup' | 'share' | 'recovery';
}) {
  return (
    <div className="public-shell">
      <div className="public-decoration" aria-hidden="true" />
      <div className="absolute top-4 right-4 z-10">
        <ThemeSelector />
      </div>
      {!home ? (
        <header className="public-header">
          <Link href="/" className="gap-1 text-sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            返回首页
          </Link>
        </header>
      ) : null}
      <main
        id="main-content"
        className={`public-content${layout ? ` public-content--${layout}` : ''}${layout === 'share' || layout === 'recovery' ? ' block! p-0! place-items-stretch!' : ''}`}
      >
        {children}
      </main>
    </div>
  );
}
