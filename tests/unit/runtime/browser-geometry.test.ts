import { expect, it } from 'vitest';
import { assertGeometry } from '../../../e2e/browser-geometry.mjs';

function geometry(size: number) {
  return {
    width: 390,
    overflow: false,
    mainOverflow: false,
    targets: [{ name: '修改', width: 88, height: size }],
  };
}
it('accepts a 44px target with floating point rectangle subtraction error', () => {
  expect(() =>
    assertGeometry(geometry(43.99993896484375), 'mobile'),
  ).not.toThrow();
});
it('still rejects a target smaller than the required size', () => {
  expect(() => assertGeometry(geometry(43.9), 'mobile')).toThrow(
    /usable target/,
  );
});
