import { afterEach, expect, it, vi } from 'vitest';
import {
  assertGeometry,
  readGeometry,
} from '../../../e2e/browser-geometry.mjs';

afterEach(() => vi.unstubAllGlobals());

function geometry(size: number) {
  return {
    width: 390,
    overflow: false,
    mainOverflow: false,
    overflowingForms: [],
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

it('rejects clipped form content even when the document and main fit', () => {
  expect(() =>
    assertGeometry(
      {
        ...geometry(44),
        overflowingForms: [{ name: 'form', width: 316, contentWidth: 455 }],
      },
      'account dialog',
    ),
  ).toThrow(/form content fits its container/);
});

it('measures visible form overflow without rejecting fitted or hidden forms', async () => {
  function form(id: string, scrollWidth: number, hidden = false) {
    return {
      id,
      clientWidth: 316,
      scrollWidth,
      parentElement: null,
      getClientRects: () => [{}],
      closest: () => (hidden ? {} : null),
      getAttribute: () => null,
    };
  }
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('document', {
    documentElement: { scrollWidth: 390 },
    querySelectorAll: (selector: string) =>
      selector === 'form'
        ? [
            form('fitted', 316),
            form('rounding', 317),
            form('account-dialog', 455),
            form('hidden', 455, true),
          ]
        : [],
  });
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }));

  const measured = await readGeometry({
    evaluate: (callback: () => unknown) => callback(),
  });
  expect(measured.overflow).toBe(false);
  expect(measured.mainOverflow).toBe(false);
  expect(measured.overflowingForms).toEqual([
    { name: 'account-dialog', width: 316, contentWidth: 455 },
  ]);
  expect(() => assertGeometry(measured, 'account dialog')).toThrow(
    /form content fits its container/,
  );
});
