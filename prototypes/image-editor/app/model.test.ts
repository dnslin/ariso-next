import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  copyRecipe,
  emptyRecipe,
  hasEdits,
  normalizeRegion,
  regionPixels,
} from './model.ts';

test('copying a recipe isolates per-image adjustments from its template', () => {
  const template = emptyRecipe();
  template.regions.push({
    id: 'account',
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.1,
    mode: 'pixelate',
    strength: 20,
    color: '#272343',
  });
  const first = copyRecipe(template);
  const second = copyRecipe(template);
  first.regions[0].x = 0.7;
  first.watermark.text = 'Only this picture';
  assert.equal(template.regions[0].x, 0.1);
  assert.equal(second.regions[0].x, 0.1);
  assert.equal(second.watermark.text, '© Ariso');
});

test('a region fits its image without losing its size when dragged past an edge', () => {
  const region = normalizeRegion({
    id: 'edge',
    x: 0.95,
    y: -0.2,
    width: 0.3,
    height: 0.4,
    mode: 'solid',
    strength: 20,
    color: '#272343',
  });
  assert.equal(region.x, 0.7);
  assert.equal(region.y, 0);
  assert.equal(region.width, 0.3);
  assert.equal(region.height, 0.4);
});

test('normalized regions scale to each picture and cover fractional edge pixels', () => {
  const region = {
    id: 'edge',
    x: 0.123,
    y: 0.234,
    width: 0.456,
    height: 0.345,
    mode: 'solid' as const,
    strength: 20,
    color: '#272343',
  };
  assert.deepEqual(regionPixels(region, 100, 200), {
    x: 12,
    y: 46,
    width: 46,
    height: 70,
  });
  assert.deepEqual(regionPixels(region, 1000, 500), {
    x: 123,
    y: 117,
    width: 456,
    height: 173,
  });
});

test('a disabled watermark is not an edit, while a mask or active watermark is', () => {
  const recipe = emptyRecipe();
  assert.equal(hasEdits(recipe), false);
  recipe.watermark.enabled = true;
  assert.equal(hasEdits(recipe), true);
  recipe.watermark.text = '   ';
  assert.equal(hasEdits(recipe), false);
  assert.equal(emptyRecipe().watermark.enabled, false);
});
