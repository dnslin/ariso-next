export const archiveVersions = ['original', 'compressed', 'watermark'] as const;
export type ArchiveVersion = (typeof archiveVersions)[number];

export interface ArchiveRequest {
  ids: string[];
  query: string;
  version: ArchiveVersion;
}

export interface ArchiveItem {
  imageId: string;
  displayName: string;
  filename: string;
  byteSize: number;
}

export interface ArchivePreparation {
  items: ArchiveItem[];
  unavailable: { imageId: string; displayName: string; reason: string }[];
  totalBytes: number;
  downloadUrl: string | null;
  expiresAt: string | null;
}
