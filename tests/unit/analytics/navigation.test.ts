import { describe, expect, it } from 'vitest';
import {
  analyticsReturnUrl,
  managementFromAnalytics,
} from '../../../src/components/analytics/navigation';
import { parseLibraryLocation } from '../../../src/app/library/query-state';
import { parseTrashLocation } from '../../../src/app/trash/query-state';

describe('analytics management return context', () => {
  it('keeps the actual management image ID and the source period without sending page context to library API filters', () => {
    for (const path of ['/library', '/trash']) {
      const target = managementFromAnalytics(
        `${path}?image=real-id`,
        '/analytics?days=30',
      );
      const params = new URLSearchParams(target.split('?')[1]);
      expect(params.get('image')).toBe('real-id');
      expect(analyticsReturnUrl(params.get('analyticsReturn'))).toBe(
        '/analytics?days=30',
      );
      const parsed =
        path === '/library'
          ? parseLibraryLocation(params)
          : parseTrashLocation(params);
      expect(parsed.filters.scope).toBe(
        path === '/library' ? 'normal' : 'trash',
      );
      expect(parsed.filters.failure).toBeNull();
    }
  });
  it('only returns to a real analytics route with an accepted period', () => {
    for (const path of ['/analytics', '/dashboard'])
      for (const days of [7, 30, 90])
        expect(analyticsReturnUrl(`${path}?days=${days}`)).toBe(
          `${path}?days=${days}`,
        );
    for (const target of [
      null,
      '',
      'https://example.com',
      '//example.com',
      '/library?days=7',
      '/analytics?days=1',
      '/analytics?days=7&days=30',
      '/analytics?days=7#x',
    ])
      expect(analyticsReturnUrl(target)).toBeNull();
  });
});
