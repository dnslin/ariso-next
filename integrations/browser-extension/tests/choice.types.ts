import { expectTypeOf } from 'vitest';
import { Choice } from '../components/ui';

const options = [
  ['public', '公开'],
  ['private', '私有'],
] as const;

// Compiled by the extension's typecheck; these calls are not runtime tests.
export function choiceTypeContracts(arbitrary: string) {
  Choice({
    label: '可见性',
    options,
    value: 'public',
    onChange(value) {
      expectTypeOf(value).toEqualTypeOf<'public' | 'private'>();
    },
  });
  Choice({
    label: '可见性',
    options,
    // @ts-expect-error A value must belong to the supplied options.
    value: 'watermark',
    onChange() {},
  });
  Choice({
    label: '可见性',
    options,
    // @ts-expect-error A broad string must not widen the option union.
    value: arbitrary,
    onChange() {},
  });
  Choice({
    label: '可见性',
    options,
    value: 'public',
    // @ts-expect-error The callback must accept every supplied option.
    onChange(value: 'public') {
      expectTypeOf(value).toEqualTypeOf<'public'>();
    },
  });
}
