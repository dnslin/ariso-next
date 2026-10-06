import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { buildImageUrl, resolveImageVersion } from '../delivery/links.ts';
import {
  getImageAccessState,
  imageVersionApplicable,
} from '../media/images.ts';
import { mediaJobs, versionKinds, type VersionKind } from '../media/schema.ts';
import { requireMediaSettings } from '../media/settings.ts';
import { requireSiteSettings } from '../site/settings.ts';
import type { UploadContext } from './cleanup.ts';
import type {
  PublicUploadError,
  PublicUploadErrorDetail,
  PublicUploadResponse,
  PublicUploadSuccess,
} from './public-contract.ts';

export const PUBLIC_UPLOAD_WAIT_TIMEOUT_MS = 900_000;
const PUBLIC_UPLOAD_POLL_MS = 250;
type AcceptedUpload = { imageId: string; jobId: string };
type PublicUploadResult = { status: number; body: PublicUploadResponse };

/** Media persists stage/code/message in this diagnostic format when settling a job. */
function jobDiagnostic(
  diagnostic: string | null,
  stage: string,
): PublicUploadErrorDetail {
  const parsed = diagnostic?.match(
    /^([a-z][a-z0-9_]*): ([A-Z][A-Z0-9_]*): ([\s\S]+)$/,
  );
  return parsed
    ? { stage: parsed[1], code: parsed[2], message: parsed[3] }
    : {
        stage,
        code: 'MEDIA_PROCESS_FAILED',
        message: diagnostic || '图片处理失败',
      };
}

function processingFailureStatus(code: string) {
  if (code === 'INSUFFICIENT_DISK_SPACE') return 507;
  if (code === 'STORAGE_DISABLED' || code === 'MEDIA_IMAGE_DELETING')
    return 409;
  if (code === 'STORAGE_TIMEOUT' || code === 'MEDIA_TOOL_TIMEOUT') return 504;
  if (code.startsWith('STORAGE_')) return 502;
  if (code === 'MEDIA_TOOL_UNAVAILABLE') return 503;
  return 422;
}

function versionOutcome(
  job: typeof mediaJobs.$inferSelect,
  classification: Parameters<typeof imageVersionApplicable>[0],
  kind: VersionKind,
): PublicUploadSuccess['processing']['versions'][VersionKind] {
  if (kind === 'original' || job.expectedVersions.includes(kind))
    return { status: 'succeeded', reason: null };
  if (imageVersionApplicable(classification, kind) === false)
    return { status: 'not_applicable', reason: 'VERSION_NOT_APPLICABLE' };
  if (kind === 'compressed' && !job.snapshot.compressionEnabled)
    return { status: 'disabled', reason: 'COMPRESSION_DISABLED' };
  if (kind === 'watermark' && job.snapshot.watermarkMode === 'off')
    return { status: 'disabled', reason: 'WATERMARK_DISABLED' };
  return { status: 'not_generated', reason: 'VERSION_NOT_GENERATED' };
}

/** A short read snapshot decides the response; no transaction spans a polling delay. */
function readPublicUploadResult(
  db: BetterSQLite3Database,
  accepted: AcceptedUpload,
  requestId: string,
  timedOut: boolean,
): PublicUploadResult | null {
  return db.transaction((tx) => {
    const job = tx
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, accepted.jobId))
      .get();
    const state = getImageAccessState(tx, accepted.imageId);
    if (
      !state ||
      state.image.trashedAt ||
      state.image.deletionStatus ||
      !job ||
      job.imageId !== accepted.imageId ||
      job.kind !== 'process' ||
      job.status === 'cancelled'
    ) {
      return {
        status: 409,
        body: {
          imageId: accepted.imageId,
          status: 'unavailable',
          ...(state
            ? { currentImageStatus: state.image.processingStatus }
            : {}),
          error: {
            code: 'IMAGE_UNAVAILABLE',
            stage: 'waiting',
            message: '本次上传已接收，但图片已回收、正在删除或任务记录已不可用',
          },
          requestId,
        },
      };
    }
    const currentImageStatus = state.image.processingStatus;
    if (job.status === 'failed') {
      const error = jobDiagnostic(job.error, job.step);
      return {
        status: processingFailureStatus(error.code),
        body: {
          imageId: accepted.imageId,
          status: 'failed',
          ...(currentImageStatus !== 'failed' ? { currentImageStatus } : {}),
          error,
          requestId,
        },
      };
    }
    if (job.status === 'succeeded') {
      const { publicUrl } = requireSiteSettings(tx);
      const defaultVersion = requireMediaSettings(tx).defaultLinkVersion;
      let actualVersion: VersionKind | null;
      try {
        actualVersion = resolveImageVersion(
          state,
          undefined,
          defaultVersion,
        ).actualVersion;
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'VERSION_UNAVAILABLE'
        ))
          throw error;
        actualVersion = null;
      }
      const versions: PublicUploadSuccess['versions'] = {};
      for (const { kind, saved } of state.versions)
        if (saved)
          versions[kind] = {
            url: buildImageUrl(publicUrl, accepted.imageId, kind),
            mime: saved.version.mime,
          };
      const outcomes = Object.fromEntries(
        versionKinds.map((kind) => [
          kind,
          versionOutcome(job, state.image.classification, kind),
        ]),
      ) as PublicUploadSuccess['processing']['versions'];
      return {
        status: 201,
        body: {
          imageId: accepted.imageId,
          status: 'ready',
          ...(currentImageStatus !== 'ready' ? { currentImageStatus } : {}),
          url: buildImageUrl(publicUrl, accepted.imageId),
          actualVersion,
          defaultResolution:
            actualVersion === null
              ? { available: false, code: 'VERSION_UNAVAILABLE' }
              : { available: true, code: null },
          versions,
          processing: {
            status: 'succeeded',
            versions: outcomes,
            warnings: job.metadataWarning
              ? [jobDiagnostic(job.metadataWarning, 'metadata')]
              : [],
          },
          requestId,
        },
      };
    }
    if (!timedOut) return null;
    const body: PublicUploadError = {
      imageId: accepted.imageId,
      status: currentImageStatus,
      error: {
        code: 'UPLOAD_WAIT_TIMEOUT',
        stage: 'waiting',
        message:
          '等待本次图片处理结果超时，请到所有者图库核对；处理任务仍会继续',
      },
      requestId,
    };
    return { status: 504, body };
  });
}

/** Wait only for this accepted durable job. Disconnecting ends waiting, never media work. */
export async function waitPublicUpload(
  context: UploadContext,
  accepted: AcceptedUpload,
  requestId: string,
  options: { signal?: AbortSignal; timeoutMs?: number; pollMs?: number } = {},
): Promise<PublicUploadResult> {
  const deadline =
    Date.now() + (options.timeoutMs ?? PUBLIC_UPLOAD_WAIT_TIMEOUT_MS);
  for (;;) {
    options.signal?.throwIfAborted();
    const result = readPublicUploadResult(
      context.db,
      accepted,
      requestId,
      false,
    );
    if (result) return result;
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      return readPublicUploadResult(context.db, accepted, requestId, true)!;
    await delay(
      Math.min(options.pollMs ?? PUBLIC_UPLOAD_POLL_MS, remaining),
      undefined,
      { signal: options.signal },
    );
  }
}
