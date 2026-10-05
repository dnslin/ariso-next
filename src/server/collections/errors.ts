export type CollectionErrorCode =
  | 'COLLECTION_TAG_CONFLICT'
  | 'COLLECTION_INVALID_INPUT'
  | 'COLLECTION_TARGET_NOT_FOUND'
  | 'COLLECTION_TARGET_REMOVED'
  | 'COLLECTION_IMAGE_UNAVAILABLE'
  | 'COLLECTION_CURSOR_INVALID';

export class CollectionError extends Error {
  readonly code: CollectionErrorCode;

  constructor(code: CollectionErrorCode, message: string) {
    super(message);
    this.name = 'CollectionError';
    this.code = code;
  }
}
