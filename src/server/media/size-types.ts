export const sizePresets = { small: 640, medium: 1280, large: 1920 } as const;
export type SizePreset = keyof typeof sizePresets;
export type SizeVersion = 'compressed' | 'watermark';
export interface ImageSizeInput {
  version: SizeVersion;
  preset: SizePreset;
}
export interface ImageSizeState extends ImageSizeInput {
  status: 'missing' | 'queued' | 'running' | 'failed' | 'cancelled' | 'ready';
  jobId: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  format: string | null;
  error: string | null;
}
