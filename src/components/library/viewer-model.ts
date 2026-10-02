import type {
  LibraryDetail,
  LibraryDetailVersion,
} from '../../server/library/detail-types';
import type { VersionKind } from '../../server/media/schema';

export type ViewerDirection = 'previous' | 'next';
export type ViewerNeighbors = Record<ViewerDirection, string | null>;

const previewMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/apng',
  'image/gif',
  'image/webp',
  'image/avif',
]);

export function viewerVersionReason(
  detail: LibraryDetail,
  version: LibraryDetailVersion | undefined,
) {
  if (detail.deletionStatus)
    return detail.deletionStatus === 'cleanup_failed'
      ? '图片清理失败，无法继续查看。'
      : '图片正在删除，无法继续查看。';
  if (detail.trashedAt) return '图片已移入回收站，无法继续查看。';
  if (!detail.storage.enabled) return '存储已停用，无法读取图片。';
  if (!version) return '此版本不存在。';
  if (version.unavailableReason) return version.unavailableReason;
  if (!version.saved) return '此版本尚未保存。';
  if (!version.previewPath) return '此版本仅支持附件下载，请返回详情下载。';
  if (!version.mime || !previewMimes.has(version.mime))
    return '此格式无法在查看器中预览，请选择已有的缩略图。';
  return null;
}

/** Viewer display never uses the site's default delivery version. */
export function initialViewerVersion(detail: LibraryDetail): VersionKind {
  if (
    detail.classification === 'preview_only' ||
    ['svg', 'ico', 'tiff', 'heif', 'heic'].includes(detail.format)
  )
    return 'thumbnail';
  const order: VersionKind[] =
    detail.animated || detail.classification === 'animated'
      ? ['original', 'compressed', 'thumbnail']
      : ['compressed', 'original', 'thumbnail'];
  return (
    order.find((kind) => {
      const version = detail.versions.find((item) => item.kind === kind);
      return viewerVersionReason(detail, version) === null;
    }) ?? 'original'
  );
}

export function isViewerPreview(detail: LibraryDetail, kind: VersionKind) {
  return (
    kind === 'thumbnail' ||
    detail.classification === 'preview_only' ||
    ((!!detail.animated || detail.classification === 'animated') &&
      kind !== 'original')
  );
}

/** Load the actual delivery URL before replacing the visible image. */
export async function readViewerPreview(
  detail: LibraryDetail,
  signal: AbortSignal,
) {
  const kind = initialViewerVersion(detail);
  const version = detail.versions.find((item) => item.kind === kind);
  if (viewerVersionReason(detail, version) !== null) return;
  signal.throwIfAborted();
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.removeAttribute('src');
      reject(signal.reason);
    };
    image.onload = () => {
      void image.decode().then(
        () => {
          cleanup();
          resolve();
        },
        (cause: unknown) => {
          cleanup();
          reject(new Error('相邻图片无法解码，请重试或返回图库。', { cause }));
        },
      );
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('相邻图片读取失败，请重试或返回图库。'));
    };
    signal.addEventListener('abort', abort, { once: true });
    image.src = version!.previewPath!;
  });
  signal.throwIfAborted();
}
