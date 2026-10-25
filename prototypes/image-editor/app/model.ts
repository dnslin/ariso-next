export type Region = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: 'pixelate' | 'solid';
  strength: number;
  color: string;
};

export type Watermark = {
  enabled: boolean;
  kind: 'text' | 'image';
  text: string;
  assetSrc: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
  tiled: boolean;
  font: 'chinese' | 'latin';
};

export type Recipe = { regions: Region[]; watermark: Watermark };
export type DemoImage = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  format: string;
  category: 'screenshot' | 'photo';
  unavailableReason?: string;
};

export function emptyRecipe(): Recipe {
  return {
    regions: [],
    watermark: {
      enabled: false,
      kind: 'text',
      text: '© Ariso',
      assetSrc: '/demo-logo.png',
      x: 0.84,
      y: 0.9,
      width: 0.2,
      fontSize: 0.035,
      opacity: 0.65,
      rotation: 0,
      color: '#ffffff',
      tiled: false,
      font: 'chinese',
    },
  };
}

export function copyRecipe(recipe: Recipe): Recipe {
  return {
    regions: recipe.regions.map((region) => ({ ...region })),
    watermark: { ...recipe.watermark },
  };
}

export function hasEdits(recipe: Recipe) {
  const mark = recipe.watermark;
  return (
    recipe.regions.length > 0 ||
    (mark.enabled &&
      Boolean(mark.kind === 'image' ? mark.assetSrc : mark.text.trim()))
  );
}

export function normalizeRegion(region: Region): Region {
  const width = Math.max(0.005, Math.min(1, region.width));
  const height = Math.max(0.005, Math.min(1, region.height));
  return {
    ...region,
    width,
    height,
    x: Math.max(0, Math.min(1 - width, region.x)),
    y: Math.max(0, Math.min(1 - height, region.y)),
  };
}

/** Round outwards so fractional boundaries cannot expose an unmasked edge. */
export function regionPixels(region: Region, width: number, height: number) {
  const normalized = normalizeRegion(region);
  const x = Math.floor(normalized.x * width);
  const y = Math.floor(normalized.y * height);
  return {
    x,
    y,
    width:
      Math.min(width, Math.ceil((normalized.x + normalized.width) * width)) - x,
    height:
      Math.min(height, Math.ceil((normalized.y + normalized.height) * height)) -
      y,
  };
}
