import { and, eq } from 'drizzle-orm';
import { mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { sep } from 'node:path';
import { readObject } from '../storage/local.ts';
import { analyzeMediaError } from './errors.ts';
import { readAndStoreMetadata } from './metadata.ts';
import type { MediaRuntime } from './process.ts';
import { settleMediaFailure } from './recovery.ts';
import { mediaJobs, mediaObjects, mediaVersions } from './schema.ts';
import { activeMediaJob } from './steps.ts';
import { terminateMediaTools } from './tools.ts';

/** Invoked only after the shared scheduler claims a content slot. No image versions are written. */
export async function processMetadataJob(
  runtime: MediaRuntime,
  jobId: string,
  signal = new AbortController().signal,
) {
  const { db, logger } = runtime;
  const workspace = `${runtime.temporaryRoot}${sep}media-${jobId}`;
  let workspaceReady = false;
  let toolCleanupFailed = false;
  try {
    const { image } = activeMediaJob(db, jobId);
    signal.throwIfAborted();
    await terminateMediaTools(workspace);
    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });
    workspaceReady = true;
    const original = db
      .select({ object: mediaObjects })
      .from(mediaVersions)
      .innerJoin(mediaObjects, eq(mediaVersions.objectId, mediaObjects.id))
      .where(
        and(
          eq(mediaVersions.imageId, image.id),
          eq(mediaVersions.kind, 'original'),
        ),
      )
      .get()!;
    const { storage } = activeMediaJob(db, jobId);
    const source = await readObject(
      runtime.storageRoot,
      storage,
      original.object.key,
      original.object.mime!,
      signal,
    );
    source.stream.destroy();
    await once(source.stream, 'close');
    const result = await readAndStoreMetadata(
      runtime,
      jobId,
      source.path,
      workspace,
      signal,
    );
    if (result.error) throw result.error;
  } catch (error) {
    toolCleanupFailed =
      (error as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED';
    const interrupted =
      !toolCleanupFailed &&
      signal.aborted &&
      (signal.reason as { code?: string })?.code === 'MEDIA_INTERRUPTED';
    const diagnostic = interrupted
      ? `metadata: ${analyzeMediaError(signal.reason).diagnostic}`
      : settleMediaFailure(
          db,
          jobId,
          'metadata',
          signal.aborted ? signal.reason : error,
        );
    if (interrupted)
      db.update(mediaJobs)
        .set({ error: diagnostic, updatedAt: new Date() })
        .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.status, 'running')))
        .run();
    logger.error(
      { err: error, jobId, step: 'metadata', diagnostic },
      'Metadata task interrupted or failed',
    );
    if (toolCleanupFailed) throw error;
  } finally {
    if (workspaceReady && !toolCleanupFailed)
      await rm(workspace, { recursive: true, force: true });
  }
}
