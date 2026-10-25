import type { ImageEditRecipe } from '../../shared/image-editing';

export type SaveMode = 'copy' | 'overwrite';
export interface EditContext {
  imageId: string;
  name: string;
  format: string;
  mime: string;
  width: number | null;
  height: number | null;
  sourceObjectId: string | null;
  sourceUrl: string | null;
  unavailableReason: string | null;
  watermarkPreview: { copy: boolean; overwrite: boolean };
}
export interface EditorImage extends EditContext {
  id: string;
  src: string;
  width: number;
  height: number;
}
export interface EditTemplate {
  id: string;
  name: string;
  recipe: ImageEditRecipe;
  createdAt: string;
  updatedAt: string;
}
export interface EditJob {
  requestId: string;
  jobId: string;
  sourceImageId: string;
  resultImageId: string;
  mode: SaveMode;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  step: string;
  error: string | null;
  finishedAt: string | null;
}
export interface EditIntent {
  requestId: string;
  sourceImageId: string;
  sourceObjectId: string;
  mode: SaveMode;
  recipe: ImageEditRecipe;
}
export interface EditReference {
  requestId: string;
  sourceImageId: string;
  mode: SaveMode;
}
export function recipeSummary(recipe: ImageEditRecipe) {
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
