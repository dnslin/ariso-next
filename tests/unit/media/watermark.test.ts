import { expect, it } from 'vitest';
import {
  escapeWatermarkText,
  watermarkPlacement,
} from '../../../src/server/media/watermark.ts';

it('escapes ImageMagick interpretation while preserving real newlines', () => {
  expect(escapeWatermarkText('@/secret%[fx:1+1]\\n\n中文')).toBe(
    '\\@/secret\\%[fx:1+1]\\\\n\n中文',
  );
});
it('centres without a margin offset and rejects text outside the available canvas', () => {
  expect(watermarkPlacement(101, 81, 20, 10, 8, 'center')).toEqual({
    x: 41,
    y: 36,
  });
  expect(watermarkPlacement(101, 81, 20, 10, 8, 'bottom-right')).toEqual({
    x: 73,
    y: 63,
  });
  expect(() => watermarkPlacement(100, 80, 91, 10, 5, 'center')).toThrow(
    '水印',
  );
});
