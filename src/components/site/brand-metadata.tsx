'use client';

import { usePathname } from 'next/navigation';

/** Keep one title and icon mounted while the router replaces page metadata. */
export function BrandMetadata({
  name,
  faviconUrl,
  faviconMime,
}: {
  name: string;
  faviconUrl: string | null;
  faviconMime: string | null;
}) {
  const pathname = usePathname();
  const title =
    pathname === '/forgot-password'
      ? '找回密码 · Ariso'
      : pathname === '/reset-password'
        ? '重置密码 · Ariso'
        : pathname.startsWith('/s/image/')
          ? `${name} · 图片分享`
          : pathname.startsWith('/s/')
            ? `${name} · 相册分享`
            : name;
  return (
    <>
      <title>{title}</title>
      {faviconUrl ? (
        <link rel="icon" href={faviconUrl} type={faviconMime ?? undefined} />
      ) : null}
    </>
  );
}
