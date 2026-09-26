import type {
  sessionResult,
  submissionResult,
} from '../../server/upload/http.ts';

export type UploadState =
  | 'queued'
  | 'submitting'
  | 'uploading'
  | 'saving'
  | 'processing-queued'
  | 'processing'
  | 'ready'
  | 'upload-failed'
  | 'processing-failed'
  | 'cancelled'
  | 'unknown';

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  previewUrl: string | null;
  state: UploadState;
  progress: number;
  visibility?: 'public' | 'private';
  storageId?: string;
  submissionId?: string;
  sessionId?: string;
  imageId?: string;
  jobId?: string;
  error?: string;
  step?: string;
  cleanupStatus?: 'none' | 'pending' | 'failed';
  cancelling?: boolean;
};

type SubmissionResponse = ReturnType<typeof submissionResult>;
export type UploadSessionResult = Pick<
  ReturnType<typeof sessionResult>,
  'id' | 'state' | 'imageId' | 'jobId' | 'error' | 'cleanupStatus'
> & {
  job?: Pick<
    NonNullable<SubmissionResponse['sessions'][number]['job']>,
    'id' | 'status' | 'error' | 'step'
  > | null;
};
export type UploadSubmissionResult = Pick<
  SubmissionResponse,
  'id' | 'storageId' | 'visibility'
> & {
  sessions: UploadSessionResult[];
};

export type UploadTransport = {
  upload(
    sessionId: string,
    onProgress: (progress: number) => void,
  ): Promise<UploadSessionResult>;
  destroy(): void;
};
export type CreateUploadTransport = (file: File, id: string) => UploadTransport;
