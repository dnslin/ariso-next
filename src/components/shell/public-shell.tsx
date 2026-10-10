import type { ReactNode } from 'react';
import { Link } from '@heroui/react/link';
import { ArrowLeft } from 'lucide-react';

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
        className={`public-content${layout ? ` public-content--${layout}` : ''}${layout === 'share' || layout === 'recovery' || layout === 'login' ? ' block! p-0! place-items-stretch!' : ''}`}
      >
        {layout === 'login' ? (
          <div className="grid min-h-dvh w-full place-items-center px-4 py-20">
            {children}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
