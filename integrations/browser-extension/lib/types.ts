export type Visibility = 'public' | 'private';
export type VersionKind = 'original' | 'compressed' | 'thumbnail' | 'watermark';
export type LinkVersion = 'site' | 'original' | 'compressed' | 'watermark';
export type CopyFormat = 'url' | 'markdown' | 'html';

export type ExtensionSettings = {
  siteUrl: string;
  token: string;
  visibility: Visibility | null;
  linkVersion: LinkVersion;
  albumId: string;
  tag: string;
  storageId: string;
  theme: 'light' | 'dark';
};

export type Capabilities = {
  maxFileBytes: number;
  queueLimit: number;
  defaultVisibility: Visibility;
  defaultLinkVersion: VersionKind;
  defaultStorageAvailable: boolean;
  requestId: string;
};

export type SavedConnection = {
  settings: ExtensionSettings;
  capabilities: Capabilities;
};

export type ItemState =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'duplicate'
  | 'failed'
  | 'unknown'
  | 'version-unavailable';
export type SavedVersion = { url: string; mime: string };
export type UploadItem = {
  id: string;
  name: string;
  bytes: number;
  previewUrl: string;
  source: 'local' | 'clipboard' | 'web';
  state: ItemState;
  progress: number;
  visibility?: Visibility;
  siteUrl?: string;
  imageId?: string;
  requestId?: string;
  message?: string;
  errorCode?: string;
  stage?: string;
  versions?: Partial<Record<VersionKind, SavedVersion>>;
  selectedVersion?: VersionKind;
  url?: string;
};

export type UploadSnapshot = { items: readonly UploadItem[]; busy: boolean };
export type AddResult = {
  added: number;
  rejected: number;
  message: string | null;
};
export type SourceRequest = { id: string; url: string };
