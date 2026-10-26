import { emptyRecipe, type DemoImage, type Recipe } from './model';
import type { EditTemplate } from './template-dialog';

export const initialImages: DemoImage[] = [
  {
    id: 'account',
    name: '账号与安全.png',
    src: '/demo-account.png',
    width: 1440,
    height: 1000,
    format: 'PNG',
    category: 'screenshot',
  },
  {
    id: 'profile',
    name: '团队账号.png',
    src: '/demo-profile.png',
    width: 1440,
    height: 1000,
    format: 'PNG',
    category: 'screenshot',
  },
  {
    id: 'receipt',
    name: '付款凭证.png',
    src: '/demo-receipt.png',
    width: 1440,
    height: 1000,
    format: 'PNG',
    category: 'screenshot',
  },
  {
    id: 'lake',
    name: '山间的湖泊.jpg',
    src: '/demo-lake.jpg',
    width: 3888,
    height: 2586,
    format: 'JPEG',
    category: 'photo',
  },
  {
    id: 'coast',
    name: '海岸的午后.jpg',
    src: '/demo-coast.jpg',
    width: 1200,
    height: 800,
    format: 'JPEG',
    category: 'photo',
  },
  {
    id: 'forest',
    name: '森林里的光.jpg',
    src: '/demo-forest.jpg',
    width: 1200,
    height: 799,
    format: 'JPEG',
    category: 'photo',
  },
  {
    id: 'animation',
    name: '动态贴纸.gif',
    src: '/demo-logo.png',
    width: 400,
    height: 130,
    format: 'GIF',
    category: 'photo',
    unavailableReason: '动态图暂不支持编辑，避免只保存第一帧',
  },
];
const signature = emptyRecipe();
signature.watermark = {
  ...signature.watermark,
  enabled: true,
  text: '© Ariso · 拍摄记录',
  fontSize: 0.035,
  x: 0.78,
  y: 0.9,
  color: '#ffffff',
  opacity: 0.8,
};
const privacy = emptyRecipe();
privacy.regions = [
  {
    id: 'account-email',
    x: 0.28,
    y: 0.452,
    width: 0.38,
    height: 0.052,
    mode: 'pixelate',
    strength: 20,
    color: '#272343',
  },
  {
    id: 'account-phone',
    x: 0.28,
    y: 0.532,
    width: 0.3,
    height: 0.052,
    mode: 'solid',
    strength: 20,
    color: '#272343',
  },
];
const tiled = emptyRecipe();
tiled.watermark = {
  ...tiled.watermark,
  enabled: true,
  text: '仅供预览',
  tiled: true,
  rotation: -28,
  opacity: 0.22,
  fontSize: 0.045,
  color: '#272343',
};
export const initialTemplates: EditTemplate[] = [
  { id: 'signature', name: '照片署名', recipe: signature },
  { id: 'account-privacy', name: '账号信息遮挡', recipe: privacy },
  { id: 'preview', name: '全图预览水印', recipe: tiled },
];
export function recipeSummary(recipe: Recipe) {
  const parts = [];
  if (recipe.regions.length) parts.push(`${recipe.regions.length} 处打码`);
  if (recipe.watermark.enabled)
    parts.push(
      recipe.watermark.tiled
        ? '平铺水印'
        : recipe.watermark.kind === 'text'
          ? '文字水印'
          : 'Logo 水印',
    );
  return parts.length ? parts.join(' · ') : '尚未编辑';
}
