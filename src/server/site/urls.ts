/** 文件名由 site 生成；版本随引用切换，不依赖请求 Host。 */
export function brandingUrl(key: string | null) {
  return key === null ? null : `/branding/${key}`;
}

/** pathname 由内部路由模块提供；不接受外部 URL 或相对路径。 */
export function buildSiteUrl(
  settings: { publicUrl: string },
  pathname: string,
  query?: URLSearchParams,
) {
  if (
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    /[\\?#\u0000-\u0020]/.test(pathname)
  ) {
    throw new Error('SITE_INVALID_PATH: 必须是站内绝对路径，查询参数单独提供');
  }
  const url = new URL(pathname, settings.publicUrl);
  if (query) url.search = query.toString();
  return url.href;
}
