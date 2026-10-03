import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import type { MediaRuntime } from './process.ts';
import { mediaPreviews, type PreviewResult } from './schema.ts';
import { createMediaResources } from './resources.ts';
import { inspectImageFile } from './file-formats.ts';
import { inspectImage } from './formats.ts';
import { prepareProcessingInput, startDerivedEncoding } from './processing.ts';
import { analyzeMediaError, mediaError } from './errors.ts';
import { releasePreviewWatermark } from './watermark-assets.ts';
import {
  cleanupPreview,
  requirePreview,
  pathFor,
  previewError,
} from './preview-state.ts';
const lifetimeMs = 30 * 60 * 1000;

export async function processMediaPreview(
  runtime: MediaRuntime,
  id: string,
  externalSignal?: AbortSignal,
) {
  const directory = pathFor(runtime, id);
  const resultPath = `${runtime.temporaryRoot}${sep}preview-${id}${sep}result`;
  const workspace = join(directory, 'work');
  const source = join(directory, 'source');
  const resources = (runtime.resources ??= createMediaResources());
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        mediaError(
          'MEDIA_JOB_TIMEOUT',
          'Preview processing exceeded 600 seconds',
        ),
      ),
    600_000,
  );
  timer.unref();
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, deadline.signal])
    : deadline.signal;
  let budget: ReturnType<typeof resources.beginStep> | undefined;
  let step = 'identify';
  try {
    const row = requirePreview(runtime, id);
    if (row.status !== 'running' || !row.snapshot || !row.target)
      throw previewError('MEDIA_PREVIEW_INACTIVE', '预览不在运行状态', 409);
    const snapshot = row.snapshot;
    await mkdir(workspace, { recursive: true });
    const beginStep = () =>
      resources.beginStep({
        temporaryDirectory: workspace,
        storageDirectory: directory,
      });
    budget = beginStep();
    let stepSignal = AbortSignal.any([signal, budget.signal]);
    const facts = await inspectImageFile(
      source,
      workspace,
      stepSignal,
      budget.diskLimitBytes,
    );
    let result: PreviewResult | null = null;
    let unavailableReason: string | null = null;
    if (row.target === 'compressed' && !snapshot.compressionEnabled)
      unavailableReason = '压缩开关已关闭';
    else if (row.target === 'watermark' && snapshot.watermarkMode === 'off')
      unavailableReason = '水印已关闭';
    else if (
      ['compressed', 'watermark'].includes(row.target) &&
      facts.classification !== 'static'
    )
      unavailableReason = '该格式为动画或仅支持预览，不适用压缩和水印';
    if (!unavailableReason) {
      if (row.target === 'original') {
        await rename(source, resultPath);
        const handle = await open(resultPath, 'r');
        try {
          result = {
            format: facts.format,
            mime: facts.mime,
            width: facts.width,
            height: facts.height,
            byteSize: (await handle.stat()).size,
          };
        } finally {
          await handle.close();
        }
      } else {
        const prepared = await prepareProcessingInput({
          sourcePath: source,
          facts,
          workspace,
          signal: stepSignal,
          diskLimitBytes: budget.diskLimitBytes,
        });
        budget.close();
        budget = undefined;
        const kinds =
          row.target === 'watermark' && snapshot.compressionEnabled
            ? (['compressed', 'watermark'] as const)
            : [row.target];
        let compressedPath: string | undefined;
        for (const kind of kinds) {
          step = kind;
          signal.throwIfAborted();
          budget = beginStep();
          stepSignal = AbortSignal.any([signal, budget.signal]);
          const controller = new AbortController();
          const cancelSignal = AbortSignal.any([stepSignal, controller.signal]);
          const tool = await startDerivedEncoding({
            input: prepared.input,
            facts,
            kind,
            snapshot,
            compressedPath,
            watermarksRoot: runtime.watermarksRoot,
            workspace,
            signal: cancelSignal,
            diskLimitBytes: budget.diskLimitBytes,
          });
          const output = join(
            directory,
            kind === row.target ? 'result' : 'compressed',
          );
          try {
            await pipeline(
              budget.countOutput(tool.child.readable()),
              createWriteStream(output, { flags: 'wx' }),
              { signal: cancelSignal },
            );
          } catch (error) {
            controller.abort(error);
            const toolError = await tool.settled;
            if (
              (toolError as { code?: string })?.code ===
              'MEDIA_TOOL_SHUTDOWN_FAILED'
            )
              throw toolError;
            throw stepSignal.aborted ? stepSignal.reason : error;
          }
          const toolError = await tool.settled;
          if (toolError) throw toolError;
          const identified = await inspectImage(
            createReadStream(output),
            workspace,
            stepSignal,
          );
          const mime = `image/${kind === 'thumbnail' ? 'webp' : snapshot.outputFormat}`;
          if (identified.mime !== mime)
            throw mediaError(
              'MEDIA_OUTPUT_INVALID',
              `Unexpected preview encoding: ${identified.format}`,
            );
          const handle = await open(output, 'r');
          try {
            result = {
              format: identified.format,
              mime: identified.mime,
              width: identified.width,
              height: identified.height,
              byteSize: (await handle.stat()).size,
            };
          } finally {
            await handle.close();
          }
          if (kind === 'compressed') compressedPath = output;
          budget.close();
          budget = undefined;
        }
      }
    }
    signal.throwIfAborted();
    budget?.check();
    budget?.close();
    budget = undefined;
    await rm(workspace, { recursive: true, force: true });
    await rm(source, { force: true });
    await rm(join(directory, 'compressed'), { force: true });
    signal.throwIfAborted();
    const now = new Date();
    runtime.db.transaction((tx) => {
      releasePreviewWatermark(tx, id);
      tx.update(mediaPreviews)
        .set({
          status: 'succeeded',
          result,
          unavailableReason,
          finishedAt: now,
          expiresAt: new Date(now.getTime() + lifetimeMs),
          cleanupStatus: 'retained',
          updatedAt: now,
        })
        .where(eq(mediaPreviews.id, id))
        .run();
    });
    runtime.logger.info(
      { previewId: id, target: row.target },
      'Media preview completed',
    );
  } catch (error) {
    const failure = signal.aborted
      ? signal.reason
      : budget?.signal.aborted
        ? budget.signal.reason
        : error;
    const cancelled =
      signal.aborted &&
      ['MEDIA_CANCELLED', 'MEDIA_INTERRUPTED'].includes(
        (signal.reason as { code?: string })?.code ?? '',
      );
    runtime.db
      .update(mediaPreviews)
      .set({
        status: cancelled ? 'cancelled' : 'failed',
        result: null,
        error: `${step}: ${analyzeMediaError(failure).diagnostic}`,
        cleanupStatus: 'pending',
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mediaPreviews.id, id))
      .run();
    runtime.logger.error(
      { err: failure, previewId: id, step },
      'Media preview failed or cancelled',
    );
    if ((error as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED')
      throw error;
  } finally {
    clearTimeout(timer);
    budget?.close();
    if (requirePreview(runtime, id).status !== 'succeeded')
      await cleanupPreview(runtime, id);
  }
}
