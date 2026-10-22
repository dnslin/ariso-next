export const archiveVersions = [
  'original',
  'compressed',
  'thumbnail',
  'watermark',
] as const;
export type ArchiveVersion = (typeof archiveVersions)[number];

export interface ArchiveRequest {
  ids: string[];
  query: string;
  version: ArchiveVersion;
}

export interface ArchivePreparation {
  downloadUrl: string;
}
