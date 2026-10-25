import type { LibraryItem } from '../../../src/server/library/types';

export type DemoImage = {
  id: string;
  name: string;
  src: string;
  bytes: number;
  daysAgo: number;
  tags: string[];
  visibility: 'public' | 'private';
  trashed?: boolean;
};
export type FilterRules = {
  tag: 'all' | 'none' | 'screenshot';
  recentDays: number | null;
  minMB: number | null;
  name: string;
  sort: 'recent' | 'size';
};
export type SmartCollection = { id: string; name: string; rules: FilterRules };
export const emptyRules: FilterRules = {
  tag: 'all',
  recentDays: null,
  minMB: null,
  name: '',
  sort: 'recent',
};
export const initialImages: DemoImage[] = [
  {
    id: 'lake',
    name: '雪山湖畔',
    src: '/demo-lake.jpg',
    bytes: 18600000,
    daysAgo: 1,
    tags: [],
    visibility: 'public',
  },
  {
    id: 'forest',
    name: '林间的光',
    src: '/demo-forest.jpg',
    bytes: 8400000,
    daysAgo: 3,
    tags: [],
    visibility: 'private',
  },
  {
    id: 'screenshot-1',
    name: '图库筛选方案',
    src: '/demo-screenshot.png',
    bytes: 2100000,
    daysAgo: 0,
    tags: ['截图', '设计'],
    visibility: 'private',
  },
  {
    id: 'coast',
    name: '海岸线',
    src: '/demo-coast.jpg',
    bytes: 12300000,
    daysAgo: 8,
    tags: ['旅行'],
    visibility: 'public',
  },
  {
    id: 'screenshot-2',
    name: '备份页面记录',
    src: '/demo-backup.png',
    bytes: 3400000,
    daysAgo: 5,
    tags: ['截图'],
    visibility: 'private',
  },
  {
    id: 'mountain',
    name: '山脊远望',
    src: '/demo-mountain.jpg',
    bytes: 14200000,
    daysAgo: 15,
    tags: [],
    visibility: 'public',
  },
  {
    id: 'screenshot-old',
    name: '上次的上传设置',
    src: '/demo-screenshot.png',
    bytes: 1800000,
    daysAgo: 12,
    tags: ['截图'],
    visibility: 'private',
  },
  {
    id: 'sunset',
    name: '海边日落',
    src: '/demo-coast.jpg',
    bytes: 9200000,
    daysAgo: 4,
    tags: ['旅行'],
    visibility: 'public',
    trashed: true,
  },
];
export const initialCollections: SmartCollection[] = [
  {
    id: 'untagged',
    name: '没有标签的图片',
    rules: { ...emptyRules, tag: 'none' },
  },
  {
    id: 'screenshots',
    name: '最近上传的截图',
    rules: { ...emptyRules, tag: 'screenshot', recentDays: 7 },
  },
  {
    id: 'large',
    name: '超过 10 MB 的原图',
    rules: { ...emptyRules, minMB: 10, sort: 'size' },
  },
];
export function matchingImages(images: DemoImage[], rules: FilterRules) {
  return images
    .filter(
      (image) =>
        !image.trashed &&
        (rules.tag !== 'none' || image.tags.length === 0) &&
        (rules.tag !== 'screenshot' || image.tags.includes('截图')) &&
        (rules.recentDays === null || image.daysAgo <= rules.recentDays) &&
        (rules.minMB === null || image.bytes > rules.minMB * 1000000) &&
        image.name.includes(rules.name.trim()),
    )
    .sort((a, b) =>
      rules.sort === 'size' ? b.bytes - a.bytes : a.daysAgo - b.daysAgo,
    );
}
export function ruleLabels(rules: FilterRules) {
  return [
    rules.tag === 'none'
      ? '没有标签'
      : rules.tag === 'screenshot'
        ? '标签：截图'
        : '',
    rules.recentDays ? `最近 ${rules.recentDays} 天` : '',
    rules.minMB !== null ? `原图 > ${rules.minMB} MB` : '',
    rules.name ? `名称包含“${rules.name}”` : '',
  ].filter(Boolean);
}
export function toLibraryItem(image: DemoImage): LibraryItem {
  return {
    id: image.id,
    displayName: image.name,
    originalName: `${image.name}.jpg`,
    byteSize: image.bytes,
    format: image.src.endsWith('.png') ? 'png' : 'jpeg',
    width: 1600,
    height: 1066,
    visibility: image.visibility,
    hasAlbums: false,
    processingStatus: 'ready',
    createdAt: new Date(
      Date.UTC(2026, 9, 23 - image.daysAgo, 10),
    ).toISOString(),
    storage: { id: 'local', name: '本地存储', enabled: true },
    versions: {
      original: true,
      compressed: true,
      thumbnail: true,
      watermark: false,
    },
    thumbnailUrl: image.src,
    thumbnailDimensions: { width: 1600, height: 1066 },
    activeJob: null,
    latestFailedJob: null,
    metadataJob: null,
    processingJob: null,
    trashedAt: image.trashed ? '2026-10-22T10:00:00Z' : null,
    deletionStatus: null,
  };
}
