import type {
  sessionResult,
  submissionResult,
} from '../../server/upload/http.ts';

export type UploadState =
  | 'queued'
  | 'submitting'
  | 'waiting-upload'
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
  frozenSubmission?: UploadSubmissionSummary;
  sessionId?: string;
  imageId?: string;
  jobId?: string;
  error?: string;
  step?: string;
  cleanupError?: string;
  cleanupStatus?: 'none' | 'pending' | 'failed';
  cancelling?: boolean;
  route?: 'local' | 'relay' | 'direct' | null;
  routeReason?: string | null;
};

type SubmissionResponse = ReturnType<typeof submissionResult>;
export type UploadSessionResult = Pick<
  ReturnType<typeof sessionResult>,
  | 'id'
  | 'queueItemId'
  | 'groupIndex'
  | 'state'
  | 'imageId'
  | 'jobId'
  | 'error'
  | 'cleanupStatus'
> & {
  route?: 'local' | 'relay' | 'direct' | null;
  routeReason?: string | null;
  job?: Pick<
    NonNullable<SubmissionResponse['sessions'][number]['job']>,
    'id' | 'status' | 'error' | 'step'
  > | null;
};
export type UploadSubmissionResult = Pick<
  SubmissionResponse,
  'id' | 'storageId' | 'visibility' | 'batchSize' | 'albumIds' | 'tagIds'
> & {
  sessions: UploadSessionResult[];
};

export type UploadSelection = {
  albumIds: readonly string[];
  tagIds: readonly string[];
  labels?: {
    storageId: string;
    storageName: string;
    albums: readonly UploadRelation[];
    tags: readonly UploadRelation[];
  };
};

export type UploadRelation = { id: string; name: string };
export type UploadSubmissionSummary = {
  id: string;
  number: number;
  count: number;
  groups: number[];
  storageName: string;
  visibility: 'public' | 'private';
  albums: UploadRelation[];
  tags: UploadRelation[];
};

export type UploadTransport = {
  upload(
    sessionId: string,
    onProgress: (progress: number) => void,
    onRoute: (
      route: 'local' | 'relay' | 'direct',
      reason: string | null,
    ) => void,
    onResubmit: (
      requestId: string,
      previousSessionId: string,
      submission: Promise<UploadSubmissionResult>,
    ) => Promise<void>,
  ): Promise<UploadSessionResult>;
  destroy(): void;
};
export type CreateUploadTransport = (file: File, id: string) => UploadTransport;
