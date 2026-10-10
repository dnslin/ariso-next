'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { BrandKind } from './branding-api';

export function BrandingMark({
  url,
  kind,
  testId,
  onMissing,
}: {
  url: string | null;
  kind: BrandKind;
  testId?: string;
  onMissing?: () => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (url && failed === url)
    return (
      <span
        role="alert"
        className="grid justify-items-center gap-1 text-xs text-danger"
      >
        <ImageOff aria-hidden className="size-6" />
        素材无法读取
      </span>
    );
  if (url)
    return (
      // Branding is already decoded by the service; retain its versioned URL.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={url}
        src={url}
        alt={`${kind === 'logo' ? 'Logo' : 'Favicon'} 预览`}
        data-testid={testId}
        className={
          kind === 'logo' ? 'size-18 object-contain' : 'size-10 object-contain'
        }
        onError={() => {
          setFailed(url);
          onMissing?.();
        }}
      />
    );
  return (
    <span
      className={`brand-wordmark grid place-items-center rounded-xl bg-default ${kind === 'logo' ? 'size-18 text-[30px]!' : 'size-10 text-xl!'}`}
      aria-label="使用内置标识"
    >
      {kind === 'logo' ? 'Ariso' : 'A'}
    </span>
  );
}
