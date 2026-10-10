'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

export type Kind = 'Logo' | 'Favicon';
export type Asset = File | 'example' | null;

export function Mark({
  asset,
  missing = false,
  small = false,
}: {
  asset: Asset;
  missing?: boolean;
  small?: boolean;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [failedAsset, setFailedAsset] = useState<Asset>(null);
  useEffect(() => {
    if (
      !(asset instanceof File) ||
      !image.current ||
      missing ||
      failedAsset === asset
    )
      return;
    const url = URL.createObjectURL(asset);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [asset, missing, failedAsset]);
  if (missing || (asset && failedAsset === asset))
    return (
      <span className="flex min-h-12 flex-wrap items-center justify-center gap-2 text-center text-sm text-danger">
        <ImageOff aria-hidden className="size-5" />
        素材无法读取
      </span>
    );
  if (asset instanceof File)
    return (
      // Browser decoding and Blob cleanup are intentional for a local-file preview.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={image}
        alt="所选素材预览"
        className={small ? 'size-10 object-contain' : 'size-18 object-contain'}
        onError={() => setFailedAsset(asset)}
      />
    );
  return (
    <span
      aria-label={asset ? '示例品牌标识' : '内置 Ariso 标识'}
      className={`grid shrink-0 place-items-center rounded-xl ${small ? 'size-10 text-xl' : 'size-18 text-3xl'} ${asset ? 'bg-accent text-accent-foreground' : 'bg-default font-[Caveat]'}`}
    >
      {asset ? '山' : small ? 'A' : 'Ariso'}
    </span>
  );
}
