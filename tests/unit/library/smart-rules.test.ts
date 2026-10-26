import { expect, it } from 'vitest';
import { parseLibraryQuery } from '../../../src/server/library/query-schema.ts';
import {
  normalizeSmartRules,
  resolveSmartRules,
  smartRulesFromFilters,
} from '../../../src/server/library/smart-rules.ts';

it('saves the relative rule without a browsing instant and resolves it afresh only when requested', () => {
  const rules = normalizeSmartRules({
    recentDays: '7',
    tagId: ['screenshot', 'screenshot'],
    sort: 'size_desc',
  });
  const first = resolveSmartRules(rules, new Date('2026-10-24T12:00:00Z'));
  const later = resolveSmartRules(rules, new Date('2026-10-25T12:00:00Z'));
  expect(
    parseLibraryQuery(new URLSearchParams(first)).filters.uploadedFrom,
  ).toBe('2026-10-17T12:00:00.000Z');
  expect(
    parseLibraryQuery(new URLSearchParams(later)).filters.uploadedFrom,
  ).toBe('2026-10-18T12:00:00.000Z');
  expect(
    smartRulesFromFilters(
      parseLibraryQuery(new URLSearchParams(first)).filters,
    ),
  ).toEqual(rules);
  expect(rules).not.toHaveProperty('relativeTo');
  expect(rules).not.toHaveProperty('uploadedFrom');
});

it.each([
  { page: '2' },
  { scope: 'trash' },
  { pageSize: '80' },
  { relativeTo: '2026-10-24T00:00:00Z' },
  { recentDays: '7', uploadedFrom: '2026-10-01T00:00:00Z' },
  { tagState: 'none', tagId: ['x'] },
  { unknown: 'x' },
])('does not save navigation state or contradictory criteria: %j', (rules) => {
  expect(() => normalizeSmartRules(rules)).toThrow();
});
