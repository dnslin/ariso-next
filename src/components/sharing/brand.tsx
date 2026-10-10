import { SiteLogo } from '../site/logo';

export interface ShareBrand {
  name: string;
  description: string;
  logoUrl?: string | null;
}

export function ShareBrandHeading({
  brand,
  description = false,
}: {
  brand: ShareBrand;
  description?: boolean;
}) {
  return (
    <header className="grid min-w-0 justify-items-center gap-1.5 text-center">
      {brand.logoUrl ? (
        <SiteLogo
          url={brand.logoUrl}
          name={brand.name}
          className="h-[71px] w-full"
        />
      ) : (
        <p className="max-w-full font-['Caveat'] text-[56px] leading-[71px] break-words">
          {brand.name}
        </p>
      )}
      {description && brand.description ? (
        <p className="text-muted text-sm leading-[22px]">{brand.description}</p>
      ) : null}
    </header>
  );
}
