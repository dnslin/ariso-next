import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { like } from 'drizzle-orm';
import type { ImageEditRecipe } from '../../shared/image-editing.ts';
import { renderEditedFile } from './edit-render.ts';
import { readEditSource } from './edit-source.ts';
import { mediaError } from './errors.ts';
import { writeReceivedFile } from './file-write.ts';
import type { MediaRuntime } from './process.ts';
import { startDerivedEncoding } from './processing.ts';
import { replacementAdmission } from './replacement.ts';
import { replacementCompression } from './replacement-render.ts';
import { createMediaResources } from './resources.ts';
import { mediaWatermarkPreviewRefs } from './schema.ts';
import { createProcessingSnapshot } from './settings.ts';
import { readMediaObject } from './storage.ts';
import { startMediaTool, terminateMediaTools } from './tools.ts';
import {
  releasePreviewWatermark,
  retainPreviewWatermark,
} from './watermark-assets.ts';

export type ImageEditPreviewInput = {
  sourceObjectId: string;
  recipe: ImageEditRecipe;
  mode?: 'copy' | 'overwrite';
  target?: 'original' | 'watermark';
};

/** Transient owner previews have a separate workspace and never create library assets. */
export function createEditPreviewRuntime(
  runtime: MediaRuntime,
  schedule: <T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ) => Promise<T>,
) {
  const root = join(runtime.temporaryRoot, 'media-edit-previews');
  const stopping = new AbortController();
  const active = new Set<Promise<Buffer>>();
  const resources = (runtime.resources ??= createMediaResources());
  async function cleanAbandoned() {
    await mkdir(root, { recursive: true });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) await terminateMediaTools(path);
      await rm(path, { recursive: true, force: true });
    }
    runtime.db
      .delete(mediaWatermarkPreviewRefs)
      .where(like(mediaWatermarkPreviewRefs.previewId, 'edit-preview-%'))
      .run();
  }
  const ready = cleanAbandoned();
  async function render(
    imageId: string,
    input: ImageEditPreviewInput,
    externalSignal: AbortSignal,
  ) {
    await ready;
    const signal = AbortSignal.any([
      externalSignal,
      AbortSignal.timeout(600_000),
    ]);
    signal.throwIfAborted();
    const id = randomUUID();
    const previewId = `edit-preview-${id}`;
    const workspace = join(root, id);
    const sourcePath = join(workspace, 'source');
    const { image, object, storage } = readEditSource(
      runtime,
      imageId,
      input.sourceObjectId,
    );
    const { watermarkAsset, siteWatermark } = runtime.db.transaction((tx) => {
      const siteWatermark =
        input.target === 'watermark'
          ? input.mode === 'overwrite'
            ? replacementAdmission(tx, imageId).snapshots.watermark
            : createProcessingSnapshot(tx)
          : undefined;
      if (
        input.target === 'watermark' &&
        (!siteWatermark || siteWatermark.watermarkMode === 'off')
      ) {
        throw Object.assign(
          mediaError(
            'MEDIA_EDIT_WATERMARK_UNAVAILABLE',
            input.mode === 'overwrite'
              ? '当前图片没有已发布的水印版本配方'
              : '站点当前未开启自动水印',
          ),
          { status: 409 },
        );
      }
      const watermarkAsset =
        input.recipe.watermark.enabled &&
        input.recipe.watermark.kind === 'image'
          ? retainPreviewWatermark(
              tx,
              `${previewId}-custom`,
              input.recipe.watermark.assetId!,
            )
          : undefined;
      if (siteWatermark?.watermarkAsset)
        retainPreviewWatermark(
          tx,
          `${previewId}-site`,
          siteWatermark.watermarkAsset.id,
        );
      return { watermarkAsset, siteWatermark };
    });
    let budget: ReturnType<typeof resources.beginStep> | undefined;
    let failure: unknown;
    let toolCleanupFailed = false;
    try {
      await mkdir(workspace);
      budget = resources.beginStep({
        temporaryDirectory: workspace,
        storageDirectory: workspace,
      });
      const stepSignal = AbortSignal.any([signal, budget.signal]);
      const source = await readMediaObject(
        runtime,
        storage,
        object.key,
        object.mime!,
        stepSignal,
      );
      await writeReceivedFile(source.stream, {
        path: sourcePath,
        resources,
        maxBytes: object.byteSize!,
        declaredSize: object.byteSize!,
        signal: stepSignal,
        sizeError: (reason) =>
          mediaError(
            'MEDIA_EDIT_PREVIEW_SOURCE_SIZE',
            `编辑预览源文件大小与保存记录不符: ${reason}`,
          ),
        mapError: (cause) => cause,
        onFailure: (cause) =>
          runtime.logger.error(
            { err: cause, previewId },
            'Edit preview source write failed',
          ),
        onProgress() {},
      });
      budget.check();
      const rendered = await renderEditedFile({
        sourcePath,
        format: image.format as 'JPEG' | 'PNG' | 'WEBP',
        recipe: input.recipe,
        watermarkAsset,
        watermarksRoot: runtime.watermarksRoot,
        workspace,
        outputPath: join(workspace, `full.${image.format.toLowerCase()}`),
        signal: stepSignal,
        diskLimitBytes: budget.diskLimitBytes,
      });
      let previewInput = `${rendered.format.toLowerCase()}:${rendered.path}`;
      if (siteWatermark) {
        const encoding = {
          input: previewInput,
          facts: { format: rendered.format, animated: false },
          snapshot: siteWatermark,
          watermarksRoot: runtime.watermarksRoot,
          workspace,
          signal: stepSignal,
          diskLimitBytes: budget.diskLimitBytes,
        };
        const compressedPath = siteWatermark.compressionEnabled
          ? await replacementCompression(encoding, (source) =>
              budget!.countOutput(source),
            )
          : undefined;
        const path = join(
          workspace,
          `site-watermark.${siteWatermark.outputFormat}`,
        );
        const controller = new AbortController();
        const encoded = await startDerivedEncoding({
          ...encoding,
          kind: 'watermark',
          compressedPath,
          signal: AbortSignal.any([stepSignal, controller.signal]),
        });
        try {
          await pipeline(
            budget.countOutput(encoded.child.readable()),
            createWriteStream(path),
            { signal: stepSignal },
          );
        } catch (error) {
          controller.abort();
          const toolError = await encoded.settled;
          if (toolError && !('isCanceled' in toolError && toolError.isCanceled))
            throw toolError;
          throw error;
        }
        const error = await encoded.settled;
        if (error) throw error;
        previewInput = `${siteWatermark.outputFormat}:${path}`;
      }
      const previewPath = join(workspace, 'preview.png');
      const tool = startMediaTool(
        'magick',
        [
          '-limit',
          'memory',
          '256MiB',
          '-limit',
          'map',
          '0',
          '-limit',
          'disk',
          String(Math.floor(budget.diskLimitBytes)),
          '-limit',
          'thread',
          '1',
          previewInput,
          '-resize',
          '1280x1280>',
          '-strip',
          `png:${previewPath}`,
        ],
        {
          workspace,
          cancelSignal: stepSignal,
          timeout: 120_000,
          env: { MAGICK_TEMPORARY_PATH: workspace },
        },
      );
      const error = await tool.settled;
      if (error) throw error;
      stepSignal.throwIfAborted();
      budget.check();
      return await readFile(previewPath, { signal: stepSignal });
    } catch (error) {
      failure = error;
      toolCleanupFailed =
        (error as { code?: string } | null)?.code ===
        'MEDIA_TOOL_SHUTDOWN_FAILED';
      if (toolCleanupFailed)
        runtime.logger.error(
          { err: error, previewId, workspace },
          'Edit preview native work did not settle; retaining workspace and Logo references',
        );
      throw error;
    } finally {
      budget?.close();
      if (!toolCleanupFailed) {
        try {
          await rm(workspace, { recursive: true, force: true });
        } catch (error) {
          if (failure)
            throw new AggregateError(
              [failure, error],
              '编辑预览失败且临时文件清理失败',
              { cause: failure },
            );
          throw error;
        } finally {
          runtime.db.transaction((tx) => {
            releasePreviewWatermark(tx, `${previewId}-custom`);
            releasePreviewWatermark(tx, `${previewId}-site`);
          });
        }
      }
    }
  }
  let closing: Promise<void> | undefined;
  return {
    ready,
    render(imageId: string, input: ImageEditPreviewInput, signal: AbortSignal) {
      const operation = schedule(
        (queuedSignal) => render(imageId, input, queuedSignal),
        AbortSignal.any([signal, stopping.signal]),
      ).finally(() => active.delete(operation));
      active.add(operation);
      return operation;
    },
    close() {
      closing ??= (async () => {
        stopping.abort(mediaError('MEDIA_INTERRUPTED', '编辑预览服务正在停止'));
        await ready;
        await Promise.allSettled([...active]);
        await cleanAbandoned();
      })();
      return closing;
    },
  };
}
