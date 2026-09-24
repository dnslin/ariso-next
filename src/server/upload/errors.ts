export class UploadError extends Error {
  readonly code: string;
  readonly status: number;
  readonly imageId: string | null;

  constructor(
    code: string,
    message: string,
    status = 400,
    imageId: string | null = null,
  ) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.status = status;
    this.imageId = imageId;
  }
}
