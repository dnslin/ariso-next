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
