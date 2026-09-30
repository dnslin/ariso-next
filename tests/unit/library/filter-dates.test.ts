import { expect, it } from 'vitest';
import { filterDateBounds } from '../../../src/app/library/library-filters';

const applied = {
  uploadedFrom: '2026-03-08T07:45:12.345Z',
  uploadedBefore: '2026-03-10T09:21:43.210Z',
};

it('preserves both absolute instants when the site time zone changes without editing dates', () => {
  for (const zone of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
    expect(filterDateBounds(applied, undefined, undefined, zone)).toEqual(
      applied,
    );
  }
});

it('recalculates only the edited calendar edge across DST and keeps the opposite precise instant', () => {
  expect(
    filterDateBounds(applied, '2026-03-08', undefined, 'America/New_York'),
  ).toEqual({ ...applied, uploadedFrom: '2026-03-08T05:00:00.000Z' });
  expect(
    filterDateBounds(applied, undefined, '2026-03-08', 'America/New_York'),
  ).toEqual({ ...applied, uploadedBefore: '2026-03-09T04:00:00.000Z' });
});

it('clears either edge independently rather than reconstructing the other from its display date', () => {
  expect(filterDateBounds(applied, null, undefined, 'Asia/Shanghai')).toEqual({
    ...applied,
    uploadedFrom: null,
  });
  expect(filterDateBounds(applied, undefined, null, 'Asia/Shanghai')).toEqual({
    ...applied,
    uploadedBefore: null,
  });
});

it('rejects an edited boundary that crosses the preserved opposite instant', () => {
  expect(() =>
    filterDateBounds(applied, '2026-03-11', undefined, 'UTC'),
  ).toThrow('上传开始日期必须早于结束边界');
  expect(() =>
    filterDateBounds(applied, undefined, '2026-03-07', 'UTC'),
  ).toThrow('上传开始日期必须早于结束边界');
});
