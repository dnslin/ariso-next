'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Only delay loading feedback; errors and ready content remain immediate. */
export function DelayedLoading({
  pending = true,
  children,
}: {
  pending?: boolean;
  children?: ReactNode;
}) {
  return pending ? <LoadingDelay>{children}</LoadingDelay> : children;
}

function LoadingDelay({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      className={visible ? 'contents' : 'contents invisible'}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}
