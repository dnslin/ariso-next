export type Visibility = 'public' | 'private';
export type ItemState =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'duplicate'
  | 'failed'
  | 'unknown'
  | 'version-unavailable';
export type QueueItem = {
  id: string;
  name: string;
  bytes: number;
  src: string;
  source: '本地图片' | '剪贴板' | '网页图片' | '示例图片';
  state: ItemState;
  progress: number;
  visibility?: Visibility;
  message?: string;
};
export const samples = [
  { name: '山间湖泊.jpg', src: '/demo-lake.jpg', bytes: 1843200 },
  { name: '沿着海岸慢慢走.jpg', src: '/demo-coast.jpg', bytes: 2306867 },
  { name: '界面灵感.png', src: '/demo-screenshot.png', bytes: 628736 },
];
export const scenarioOptions = [
  ['normal', '正常上传'],
  ['first-connection', '首次连接'],
  ['token-invalid', 'Token 已失效'],
  ['duplicate', '图片重复'],
  ['upload-error', '上传失败'],
  ['unknown', '结果待核对'],
  ['version-unavailable', '所选版本不可用'],
  ['source-denied', '网页图片无法获取'],
] as const;
export const versionOptions = [
  ['site', '跟随站点默认'],
  ['original', '原图'],
  ['compressed', '压缩图'],
  ['watermark', '水印图'],
] as const;
export const sourceName = 'images.journal.example';
export const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export function resultText(item: QueueItem, format: string, version: string) {
  const url = `https://images.example/i/demo-${item.id}?type=${version === 'site' ? 'compressed' : version}`;
  const name = item.name.replace(/\.[^.]+$/, '');
  if (format === 'markdown')
    return `![${name.replace(/[\\[\]]/g, '\\$&')}](${url})`;
  if (format === 'html')
    return `<img src="${url.replaceAll('&', '&amp;')}" alt="${name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}">`;
  return url;
}
