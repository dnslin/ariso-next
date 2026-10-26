export const version = (kind: string) => ({
  url: `https://images.example/i/image-7?type=${kind}`,
  mime: 'image/png',
});
export function successfulResponse() {
  const outcome = { status: 'succeeded', reason: null };
  return {
    imageId: 'image-7',
    status: 'ready',
    url: 'https://images.example/i/image-7',
    actualVersion: 'compressed',
    defaultResolution: { available: true, code: null },
    versions: {
      original: version('original'),
      compressed: version('compressed'),
    },
    processing: {
      status: 'succeeded',
      versions: {
        original: outcome,
        compressed: outcome,
        thumbnail: outcome,
        watermark: { status: 'disabled', reason: 'WATERMARK_DISABLED' },
      },
      warnings: [],
    },
    requestId: 'request-7',
  };
}
