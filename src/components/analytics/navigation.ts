/** Only analytics pages can be a management-detail return destination. */
export function analyticsReturnUrl(value: string | null) {
  if (!value) return null;
  const match = /^(\/analytics|\/dashboard)\?days=(7|30|90)$/.exec(value);
  return match ? value : null;
}

export function managementFromAnalytics(managementUrl: string, source: string) {
  const [path, query] = managementUrl.split('?');
  const params = new URLSearchParams(query);
  params.set('analyticsReturn', source);
  return `${path}?${params}`;
}

export const analyticsReturnKey = 'ariso-analytics-return';

export function restoreAnalyticsReturn(
  source: string,
  statisticsOpen: boolean,
) {
  if (statisticsOpen) return;
  const stored = sessionStorage.getItem(analyticsReturnKey);
  if (!stored) return;
  const saved = JSON.parse(stored) as {
    source: string;
    imageId: string;
    scrollTop: number;
  };
  if (saved.source !== source) return;
  const frame = requestAnimationFrame(() => {
    const main = document.getElementById('main-content');
    const origin = document.querySelector<HTMLElement>(
      `[data-testid="analytics-popular"] li[data-image-id="${CSS.escape(saved.imageId)}"] button`,
    );
    if (!main || !origin) return;
    main.scrollTop = saved.scrollTop;
    origin.focus({ preventScroll: true });
    sessionStorage.removeItem(analyticsReturnKey);
  });
  return () => cancelAnimationFrame(frame);
}
