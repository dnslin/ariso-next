import { describe, expect, it } from 'vitest';
import {
  copyImageEditRecipe,
  emptyImageEditRecipe,
  hasImageEdits,
  imageEditRecipeSchema,
  normalizeImageEditRegion,
  regionPixels,
} from '../../../src/shared/image-editing.ts';

describe('image editing recipe', () => {
  it('accepts the disabled default and isolates copies used by different pictures', () => {
    const source = emptyImageEditRecipe();
    expect(imageEditRecipeSchema.parse(source)).toEqual(source);
    expect(hasImageEdits(source)).toBe(false);
    source.regions.push({
      id: 'private',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.1,
      mode: 'solid',
      strength: 20,
      color: '#272343',
    });
    const copy = copyImageEditRecipe(source);
    copy.regions[0].x = 0.5;
    copy.watermark.text = '另一个模板';
    expect(source.regions[0].x).toBe(0.1);
    expect(source.watermark.text).toBe('© Ariso');
    expect(hasImageEdits(source)).toBe(true);
  });
  it('rejects duplicate identities, nonfinite positions and areas outside the image', () => {
    const recipe = emptyImageEditRecipe();
    const region = {
      id: 'mask',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.1,
      mode: 'solid' as const,
      strength: 20,
      color: '#272343',
    };
    expect(
      imageEditRecipeSchema.safeParse({ ...recipe, regions: [region, region] })
        .success,
    ).toBe(false);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        regions: [{ ...region, x: Infinity }],
      }).success,
    ).toBe(false);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        regions: [{ ...region, x: 0.9 }],
      }).success,
    ).toBe(false);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        regions: [{ ...region, color: 'red' }],
      }).success,
    ).toBe(false);
  });
  it('validates active watermark content without treating disabled fields as active', () => {
    const recipe = emptyImageEditRecipe();
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        watermark: { ...recipe.watermark, enabled: true, text: '   ' },
      }).success,
    ).toBe(false);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        watermark: {
          ...recipe.watermark,
          enabled: true,
          text: '中'.repeat(201),
        },
      }).success,
    ).toBe(false);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        watermark: {
          ...recipe.watermark,
          enabled: true,
          text: 'a\nb\nc\nd\ne\nf',
        },
      }).success,
    ).toBe(false);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        watermark: {
          ...recipe.watermark,
          enabled: true,
          kind: 'image',
          assetId: null,
        },
      }).success,
    ).toBe(false);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        watermark: {
          ...recipe.watermark,
          enabled: true,
          kind: 'image',
          assetId: 'a3e82132-2dba-4abd-b0a7-74bf80570a4e',
        },
      }).success,
    ).toBe(true);
    expect(
      imageEditRecipeSchema.safeParse({
        ...recipe,
        watermark: { ...recipe.watermark, enabled: false, text: '' },
      }).success,
    ).toBe(true);
  });
  it('keeps a moved box in the picture and covers fractional edge pixels at every size', () => {
    const region = {
      id: 'edge',
      x: 0.81,
      y: 0.82,
      width: 0.3,
      height: 0.2,
      mode: 'pixelate' as const,
      strength: 20,
      color: '#000000',
    };
    expect(normalizeImageEditRegion(region)).toMatchObject({
      x: 0.7,
      y: 0.8,
      width: 0.3,
      height: 0.2,
    });
    const inside = {
      ...region,
      x: 0.101,
      y: 0.201,
      width: 0.203,
      height: 0.105,
    };
    expect(regionPixels(inside, 101, 81)).toEqual({
      x: 10,
      y: 16,
      width: 21,
      height: 9,
    });
    expect(regionPixels(inside, 202, 162)).toEqual({
      x: 20,
      y: 32,
      width: 42,
      height: 18,
    });
  });
});
