/** 只回到已交付的受保护入口；不能把外部 URL 或未实现路径当成目的地。 */
export function loginDestination(value: string | string[] | undefined) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return '/admin';
  let url: URL;
  try {
    url = new URL(value, 'https://ariso.invalid');
  } catch {
    return '/admin';
  }
  return url.origin === 'https://ariso.invalid' &&
    ([
      '/admin',
      '/dashboard',
      '/analytics',
      '/upload',
      '/library',
      '/trash',
      '/albums',
      '/tags',
      '/shares',
      '/settings/account',
      '/settings/api',
      '/settings/api/usage',
      '/settings/email',
    ].includes(url.pathname) ||
      /^\/(?:albums|shares)\/[^/]+$/.test(url.pathname))
    ? `${url.pathname}${url.search}${url.hash}`
    : '/admin';
}
