import {
  regionPixels,
  type ImageEditRecipe as Recipe,
  type ImageEditWatermark as Watermark,
} from '../../shared/image-editing';
import type { EditorImage as DemoImage } from './types';
import { watermarkImageUrl } from './client';

const loadedImages = new Map<string, Promise<HTMLImageElement>>();

export function releaseImage(src: string) {
  loadedImages.delete(src);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const previous = loadedImages.get(src);
  if (previous) return previous;
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      loadedImages.delete(src);
      reject(new Error('无法读取图片，请重新选择图片或重试。'));
    };
    image.src = src;
  });
  loadedImages.set(src, loading);
  return loading;
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context)
    throw new Error('浏览器无法创建画布，请使用支持 Canvas 的浏览器。');
  return { element, context };
}

export function watermarkMetrics(
  mark: Watermark,
  width: number,
  height: number,
) {
  const fontSize = Math.max(1, Math.min(width, height) * mark.fontSize);
  const lines = mark.text.split('\n');
  const lineHeight = fontSize * 1.35;
  return { fontSize, lines, lineHeight };
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  mark: Watermark,
  width: number,
  height: number,
  logo?: HTMLImageElement,
) {
  const { fontSize, lines, lineHeight } = watermarkMetrics(mark, width, height);
  context.font = `500 ${fontSize}px ${mark.font === 'chinese' ? '"Noto Sans SC"' : 'Arial'}, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = mark.color;
  context.globalAlpha = mark.opacity;
  const markWidth = logo
    ? width * mark.width
    : Math.max(
        fontSize,
        ...lines.map((line) => context.measureText(line).width),
      );
  const markHeight = logo
    ? markWidth * (logo.naturalHeight / logo.naturalWidth)
    : lines.length * lineHeight;
  const draw = (x: number, y: number) => {
    context.save();
    context.translate(x, y);
    context.rotate((mark.rotation * Math.PI) / 180);
    if (logo) {
      context.drawImage(
        logo,
        -markWidth / 2,
        -markHeight / 2,
        markWidth,
        markHeight,
      );
    } else {
      lines.forEach((line, index) => {
        context.fillText(
          line,
          0,
          (index - (lines.length - 1) / 2) * lineHeight,
        );
      });
    }
    context.restore();
  };
  if (mark.tiled) {
    const spacingX = Math.max(markWidth * 1.8, width * 0.22);
    const spacingY = Math.max(markHeight * 3.5, height * 0.15);
    for (
      let row = 0, y = spacingY / 2;
      y < height + spacingY;
      row++, y += spacingY
    ) {
      for (
        let x = spacingX * (row % 2 ? 0.25 : 0.75);
        x < width + spacingX;
        x += spacingX
      ) {
        draw(x, y);
      }
    }
  } else {
    draw(mark.x * width, mark.y * height);
  }
  context.globalAlpha = 1;
}

/** Browser-only immediate preview. Authoritative output is rendered by the server. */
export async function renderEditedImage(
  image: DemoImage,
  recipe: Recipe,
): Promise<HTMLCanvasElement> {
  const source = await loadImage(image.src);
  const width = source.naturalWidth;
  const height = source.naturalHeight;
  const output = canvas(width, height);
  output.context.drawImage(source, 0, 0);
  for (const region of recipe.regions) {
    const area = regionPixels(region, width, height);
    if (region.mode === 'solid') {
      output.context.fillStyle = region.color;
      output.context.globalAlpha = 1;
      output.context.fillRect(area.x, area.y, area.width, area.height);
      continue;
    }
    const blockSize = Math.max(
      2,
      Math.round((Math.min(width, height) * region.strength) / 1000),
    );
    const reduced = canvas(
      Math.max(1, Math.ceil(area.width / blockSize)),
      Math.max(1, Math.ceil(area.height / blockSize)),
    );
    reduced.context.drawImage(
      output.element,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      reduced.element.width,
      reduced.element.height,
    );
    output.context.imageSmoothingEnabled = false;
    output.context.drawImage(
      reduced.element,
      0,
      0,
      reduced.element.width,
      reduced.element.height,
      area.x,
      area.y,
      area.width,
      area.height,
    );
    output.context.imageSmoothingEnabled = true;
  }
  if (
    recipe.watermark.enabled &&
    (recipe.watermark.kind === 'text' || recipe.watermark.assetId)
  ) {
    const logo =
      recipe.watermark.kind === 'image'
        ? await loadImage(watermarkImageUrl(recipe.watermark.assetId!))
        : undefined;
    if (!logo && document.fonts) {
      const { fontSize } = watermarkMetrics(recipe.watermark, width, height);
      await document.fonts.load(
        `500 ${fontSize}px ${recipe.watermark.font === 'chinese' ? '"Noto Sans SC"' : 'Arial'}`,
        recipe.watermark.text,
      );
    }
    drawWatermark(output.context, recipe.watermark, width, height, logo);
  }
  return output.element;
}
