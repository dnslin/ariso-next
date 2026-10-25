import { isValidElement, useState, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { LibraryRangeCondition } from '../../../src/app/library/library-range-conditions';
import { parseLibraryQuery } from '../../../src/server/library/query-schema';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: vi.fn(),
}));
type FormProps = {
  children?: ReactNode;
  onSubmit?: (event: { preventDefault: () => void }) => void;
};
function findSubmit(node: ReactNode): FormProps['onSubmit'] {
  if (Array.isArray(node)) {
    for (const child of node) {
      const submit = findSubmit(child);
      if (submit) return submit;
    }
    return;
  }
  if (!isValidElement<FormProps>(node)) return;
  return node.props.onSubmit ?? findSubmit(node.props.children);
}
function submitSize(minimum: string, maximum = '') {
  const close = vi.fn();
  const error = vi.fn();
  for (const [value, setter] of [
    [true, close],
    ['7', vi.fn()],
    [minimum, vi.fn()],
    [maximum, vi.fn()],
    ['', error],
  ] as const)
    vi.mocked(useState).mockReturnValueOnce([value, setter]);
  const apply = vi.fn();
  const view = LibraryRangeCondition({
    kind: 'size',
    filters: parseLibraryQuery(new URLSearchParams()).filters,
    onApply: apply,
  });
  const submit = findSubmit(view);
  expect(submit).toBeTypeOf('function');
  submit!({ preventDefault() {} });
  return { apply, error, close };
}
beforeEach(() => vi.mocked(useState).mockReset());

it.each([
  ['1.001', '', '1001000', null],
  ['1.000001', '', '1000001', null],
  ['', '1.001', null, '1001000'],
  ['0', '0.000001', '0', '1'],
  ['.5', '', '500000', null],
  ['1.', '', '1000000', null],
  [' 0001.001 ', '', '1001000', null],
  ['', '', null, null],
  ['9007199254.740991', '', '9007199254740991', null],
])(
  'applies decimal MB %s / %s as exact bytes',
  (minimum, maximum, lower, upper) => {
    const { apply, error, close } = submitSize(minimum, maximum);
    expect(error).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      sizeGreaterThan: lower,
      sizeLessThan: upper,
    });
    expect(close).toHaveBeenCalledWith(false);
  },
);
it.each([
  '-1',
  '-0.1',
  '0.0000001',
  '1.1234567',
  '1.0000000',
  '1e2',
  '0x10',
  'NaN',
  'Infinity',
  '.',
  '9007199254.740992',
])('keeps invalid MB %s editable without applying filters', (value) => {
  for (const [minimum, maximum] of [
    [value, ''],
    ['', value],
  ]) {
    vi.mocked(useState).mockReset();
    const { apply, error, close } = submitSize(minimum, maximum);
    expect(apply).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('大小必须是非负数，最多保留 6 位小数');
    expect(close).not.toHaveBeenCalled();
  }
});
it.each([
  ['1.001', '1.001'],
  ['1.001', '1.000001'],
])('rejects equal or reversed strict bounds %s / %s', (lower, upper) => {
  const { apply, error, close } = submitSize(lower, upper);
  expect(apply).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith('大小下界必须小于上界');
  expect(close).not.toHaveBeenCalled();
});
