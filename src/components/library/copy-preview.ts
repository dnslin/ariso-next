import type { SelectedLibraryItem } from '../../server/library/selection-types';

/** Reuse pixels already on the page without requesting image content for copying. */
export function captureCopyPreview(items: SelectedLibraryItem[]) {
  for (const item of items) {
    const card = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="library-card"]'),
    ].find((element) => element.dataset.imageId === item.id);
    const image = card?.querySelector<HTMLImageElement>('img');
    if (!image?.complete || !image.naturalWidth || !item.storage.enabled)
      continue;
    if (
      image.currentSrc.startsWith('data:') ||
      image.currentSrc.startsWith('blob:')
    )
      return { item, url: image.currentSrc, reason: null };
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 224;
      canvas.height = 168;
      const context = canvas.getContext('2d');
      if (!context)
        return { item, url: null, reason: '浏览器无法读取已加载缩略图' };
      const scale = Math.max(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight,
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(
        image,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      );
      return { item, url: canvas.toDataURL('image/png'), reason: null };
    } catch (error) {
      return {
        item,
        url: null,
        reason: `已加载缩略图无法复用：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return {
    item: items[0],
    url: null,
    reason: '当前页面没有已加载的对应缩略图',
  };
}
