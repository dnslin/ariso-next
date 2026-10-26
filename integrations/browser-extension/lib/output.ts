import type { CopyFormat, UploadItem } from './types';

export function resultText(
  item: UploadItem,
  format: CopyFormat,
): string | null {
  if (item.state !== 'ready' || item.visibility !== 'public' || !item.url)
    return null;
  const name = item.name.replace(/\.[^.]+$/, '');
  if (format === 'markdown')
    return `![${name.replace(/[\\[\]]/g, '\\$&')}](${item.url.replaceAll('(', '\\(').replaceAll(')', '\\)')})`;
  if (format === 'html') {
    const escape = (value: string) =>
      value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    return `<img src="${escape(item.url)}" alt="${escape(name)}">`;
  }
  return item.url;
}
