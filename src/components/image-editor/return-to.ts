export function imageEditorReturn(value: string | null | undefined) {
  if (!value || !URL.canParse(value, 'http://ariso.internal'))
    return '/library';
  const url = new URL(value, 'http://ariso.internal');
  return url.origin === 'http://ariso.internal' &&
    (url.pathname === '/upload' ||
      url.pathname === '/library' ||
      url.pathname.startsWith('/library/') ||
      url.pathname.startsWith('/albums/'))
    ? `${url.pathname}${url.search}`
    : '/library';
}
