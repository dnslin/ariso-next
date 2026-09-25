export const versionLabels = {
  original: '原图',
  compressed: '压缩图',
  thumbnail: '缩略图',
  watermark: '水印图',
};
export const processingLabels = {
  pending: '等待处理',
  processing: '处理中',
  ready: '已就绪',
  failed: '处理失败',
};
export const stepLabels: Record<string, string> = {
  identify: '识别图片',
  original: '保存原图',
  compressed: '生成压缩图',
  thumbnail: '生成缩略图',
  watermark: '生成水印图',
  complete: '处理完成',
};
export function bytesLabel(bytes: number) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
}
