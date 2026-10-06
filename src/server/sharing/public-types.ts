/** This anonymous contract deliberately contains no management image fields. */
export interface PublicShareItem {
  imageId: string;
  aspectRatio: number;
  status: 'ready' | 'processing' | 'failed' | 'disabled' | 'missing';
  thumbnailUrl: string | null;
  previewUrl: string | null;
  displayName?: string;
}

export interface PublicShareNeighbors {
  current: PublicShareItem | null;
  previous: PublicShareItem | null;
  next: PublicShareItem | null;
  showName: boolean;
  total: number;
  position: number | null;
}

export interface PublicShareAlbum {
  albumName: string;
  description: string;
  layout: 'grid' | 'masonry';
  showName: boolean;
  total: number;
  cover: PublicShareItem | null;
}

export interface PublicSharePage extends PublicShareAlbum {
  items: PublicShareItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PublicShareRefresh extends PublicShareAlbum {
  items: PublicShareItem[];
}
