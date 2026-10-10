'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

/** A configured asset remains visibly unavailable until replaced or deleted. */
export function SiteLogo({
  url,
  name,
  className,
}: {
  url: string;
  name: string;
  className: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      className={`inline-flex max-w-full items-center justify-center ${className}`}
      data-testid="site-logo"
    >
      {failedUrl === url ? (
        <span
          role="img"
          aria-label={`${name} Logo 无法加载`}
          className="flex flex-wrap items-center justify-center gap-1 text-center text-xs font-normal text-muted"
        >
          <ImageOff aria-hidden className="size-4 shrink-0" />
          Logo 无法加载
        </span>
      ) : (
        // User-supplied local branding URLs include their immutable version.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          ref={(image) => {
            // Cached failures can precede React attaching the error handler.
            if (image?.complete && image.naturalWidth === 0) setFailedUrl(url);
          }}
          src={url}
          alt={`${name} Logo`}
          className="h-full w-full object-contain"
          onError={() => setFailedUrl(url)}
        />
      )}
    </span>
  );
}
