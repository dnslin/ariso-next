import { expect, it } from 'vitest';
import {
  hasUnsavedSiteChanges,
  siteDraft,
} from '../../../src/components/site/model';
import type { SiteSettingsResponse } from '../../../src/components/site/api';
const saved: SiteSettingsResponse = {
  id: 1,
  name: 'Ariso',
  description: '',
  publicUrl: 'https://img.example.com',
  timeZone: 'UTC',
  logoKey: null,
  logoUrl: null,
  logoMime: null,
  faviconKey: null,
  faviconUrl: null,
  faviconMime: null,
  updatedAt: '2026-10-08T00:00:00.000Z',
  githubCallbackUrl: 'https://img.example.com/api/auth/callback/github',
};
it('离开确认只比较本组规范化标量，已确认且仅有规范化差异无需放弃', () => {
  expect(hasUnsavedSiteChanges(siteDraft(saved), saved, 'ready')).toBe(false);
  expect(
    hasUnsavedSiteChanges(
      {
        ...siteDraft(saved),
        name: '  Ariso  ',
        publicUrl: 'https://IMG.EXAMPLE.COM:443/',
      },
      saved,
      'confirmed',
    ),
  ).toBe(false);
  expect(
    hasUnsavedSiteChanges(
      { ...siteDraft(saved), description: '草稿' },
      saved,
      'ready',
    ),
  ).toBe(true);
  expect(
    hasUnsavedSiteChanges(
      { ...siteDraft(saved), timeZone: 'invalid' },
      saved,
      'ready',
    ),
  ).toBe(true);
});
it.each(['saving', 'unknown', 'checking', 'check-error', 'different'] as const)(
  '未确定提交 %s 即使字段相同也需要离开确认',
  (phase) => {
    expect(hasUnsavedSiteChanges(siteDraft(saved), saved, phase)).toBe(true);
  },
);
