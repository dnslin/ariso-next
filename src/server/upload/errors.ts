import type { UploadSettingsFieldError } from '../../shared/upload-settings.ts';

export class UploadError extends Error {
  readonly code: string;
  readonly status: number;
  readonly imageId: string | null;
  readonly fields?: UploadSettingsFieldError[];

  constructor(
    code: string,
    message: string,
    status = 400,
    imageId: string | null = null,
    fields?: UploadSettingsFieldError[],
  ) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.status = status;
    this.imageId = imageId;
    this.fields = fields;
  }
}
