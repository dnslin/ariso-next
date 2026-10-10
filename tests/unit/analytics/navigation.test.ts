import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsReturnUrl,
  analyticsReturnKey,
  restoreAnalyticsReturn,
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

afterEach(() => vi.unstubAllGlobals());

function returnPage() {
  const stored = new Map([
    [
      analyticsReturnKey,
      JSON.stringify({
        source: '/analytics?days=30',
        imageId: 'real-id',
        scrollTop: 640,
      }),
    ],
  ]);
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const main = { scrollTop: 0 };
  const origin = { focus: vi.fn() };
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    removeItem: (key: string) => stored.delete(key),
  });
  vi.stubGlobal('document', {
    getElementById: () => main,
    querySelector: () => origin,
  });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return {
    stored,
    frames,
    main,
    origin,
    flush: () => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    },
  };
}

it('restores the real reading position and focus before consuming the snapshot', () => {
  const page = returnPage();
  restoreAnalyticsReturn('/analytics?days=30', false);
  expect(page.stored.has(analyticsReturnKey)).toBe(true);
  page.flush();
  expect(page.main.scrollTop).toBe(640);
  expect(page.origin.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(page.stored.has(analyticsReturnKey)).toBe(false);
});

it('retains a cancelled restoration for the next overview render', () => {
  const page = returnPage();
  const cancel = restoreAnalyticsReturn('/analytics?days=30', false);
  cancel?.();
  page.flush();
  expect(page.main.scrollTop).toBe(0);
  expect(page.origin.focus).not.toHaveBeenCalled();
  restoreAnalyticsReturn('/analytics?days=30', false);
  page.flush();
  expect(page.main.scrollTop).toBe(640);
  expect(page.origin.focus).toHaveBeenCalledTimes(1);
  expect(page.stored.has(analyticsReturnKey)).toBe(false);
});

it('does not consume a snapshot belonging to another period', () => {
  const page = returnPage();
  restoreAnalyticsReturn('/analytics?days=7', false);
  page.flush();
  expect(page.main.scrollTop).toBe(0);
  expect(page.origin.focus).not.toHaveBeenCalled();
  expect(page.stored.has(analyticsReturnKey)).toBe(true);
});

it('retains the snapshot until its ranking control is present', () => {
  const page = returnPage();
  vi.stubGlobal('document', {
    getElementById: () => page.main,
    querySelector: () => null,
  });
  restoreAnalyticsReturn('/analytics?days=30', false);
  page.flush();
  expect(page.main.scrollTop).toBe(0);
  expect(page.origin.focus).not.toHaveBeenCalled();
  expect(page.stored.has(analyticsReturnKey)).toBe(true);
});

it('leaves a newly saved navigation snapshot untouched while source statistics are still open', () => {
  const page = returnPage();
  restoreAnalyticsReturn('/analytics?days=30', true);
  page.flush();
  expect(page.main.scrollTop).toBe(0);
  expect(page.origin.focus).not.toHaveBeenCalled();
  expect(page.stored.has(analyticsReturnKey)).toBe(true);
});
