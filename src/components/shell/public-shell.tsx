import type { ReactNode } from 'react';
import { Link } from '@heroui/react/link';

export function PublicShell({
  children,
  home = false,
}: {
  children: ReactNode;
  home?: boolean;
}) {
  return (
    <div className="public-shell">
      <div className="public-decoration" aria-hidden="true" />
      {!home ? (
        <header className="public-header">
          <Link href="/">返回首页</Link>
        </header>
      ) : null}
      <main id="main-content" className="public-content">
        {children}
      </main>
    </div>
  );
}
