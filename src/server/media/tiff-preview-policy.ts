export const tiffPreviewMaxBytes = 50 * 1024 * 1024;
export const tiffPreviewDownloadRequired =
  'TIFF 原图超过 50 MiB，请下载后查看。';

export function canPreviewTiff(byteSize: number | null) {
  return byteSize !== null && byteSize <= tiffPreviewMaxBytes;
}

export function buildTiffPreviewPath(imageId: string) {
  return `/api/images/${encodeURIComponent(imageId)}/preview`;
}
