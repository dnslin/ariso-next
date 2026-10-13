import { describe, expect, it } from 'vitest';
import { checkGlyph, comparePixels } from '../../../scripts/verify-image.mjs';

describe('decoded image verification', () => {
  const original = Buffer.from([0, 30, 60, 90, 120, 150, 180, 210, 255]);
  it('接受有损编码造成的小幅像素变化并记录误差', () => {
    expect(
      comparePixels(
        Buffer.from(original.map((value) => Math.min(255, value + 2))),
        original,
        'sample',
      ),
    ).toBeLessThan(2);
  });
  it('拒绝仍有丰富色彩但内容被替换的图片', () => {
    expect(() =>
      comparePixels(
        Buffer.from(original.map((value) => 255 - value)),
        original,
        'inverted',
      ),
    ).toThrow('pixel error');
  });
  it('拒绝空输出、错误尺寸和替换为空白的图片', () => {
    expect(() =>
      comparePixels(Buffer.alloc(0), Buffer.alloc(0), 'empty'),
    ).toThrow('empty');
    expect(() => comparePixels(Buffer.alloc(2), original, 'short')).toThrow(
      'byte count',
    );
    expect(() =>
      comparePixels(Buffer.alloc(original.length, 255), original, 'blank'),
    ).toThrow('pixel variation');
  });
});

describe('rendered glyph verification', () => {
  const missing = Buffer.alloc(96 * 96, 255).fill(0, 200, 300);
  it('接受可见且不同于缺字控制图的字形', () => {
    const glyph = Buffer.alloc(96 * 96, 255).fill(0, 400, 600);
    expect(checkGlyph(glyph, missing, '中')).toBe(200);
  });
  it('拒绝空白、纯色、截断和缺字方框', () => {
    expect(() =>
      checkGlyph(Buffer.alloc(96 * 96, 255), missing, 'blank'),
    ).toThrow('blank');
    expect(() => checkGlyph(Buffer.alloc(96 * 96), missing, 'solid')).toThrow(
      'solid',
    );
    expect(() => checkGlyph(Buffer.alloc(0), missing, 'short')).toThrow(
      'dimensions',
    );
    expect(() => checkGlyph(Buffer.from(missing), missing, 'missing')).toThrow(
      'missing glyph',
    );
  });
});
