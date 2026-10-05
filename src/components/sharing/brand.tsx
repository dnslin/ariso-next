export interface ShareBrand {
  name: string;
  description: string;
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
      <p className="max-w-full font-['Caveat'] text-[56px] leading-[71px] break-words">
        {brand.name}
      </p>
      {description && brand.description ? (
        <p className="text-muted text-sm leading-[22px]">{brand.description}</p>
      ) : null}
    </header>
  );
}
