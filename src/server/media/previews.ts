import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { Readable } from 'node:stream';
import { create as contentDisposition } from 'content-disposition';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { MediaRuntime } from './process.ts';
import { mediaPreviews } from './schema.ts';
import { receivePreviewMultipart } from './preview-http.ts';
import { requireUploadSettings } from '../upload/settings.ts';
import { createMediaResources } from './resources.ts';
import { analyzeMediaError, mediaError } from './errors.ts';
import {
  cleanupPreview,
  requirePreview,
  queuePreview,
  pathFor,
  previewError,
} from './preview-state.ts';
import { processMediaPreview } from './preview-process.ts';
export {
  cleanupPreview,
  requirePreview,
  queuePreview,
  claimNextPreview,
} from './preview-state.ts';
export { processMediaPreview } from './preview-process.ts';

export function startPreviewRuntime(runtime: MediaRuntime) {
  const active = new Map<
    string,
    { controller: AbortController; execution: Promise<unknown> }
  >();
  let stopping = false;
  // Persist recovery synchronously before the first reception can register a new task.
  runtime.db
    .update(mediaPreviews)
    .set({
      status: 'cancelled',
      error: 'MEDIA_INTERRUPTED: 预览在重启时终止，请重新预览',
      cleanupStatus: 'pending',
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(mediaPreviews.status, ['receiving', 'queued', 'running']))
    .run();
  runtime.db
    .update(mediaPreviews)
    .set({ status: 'expired', cleanupStatus: 'pending', updatedAt: new Date() })
    .where(eq(mediaPreviews.status, 'succeeded'))
    .run();

  async function maintenance(now = new Date()) {
    runtime.db
      .update(mediaPreviews)
      .set({ status: 'expired', cleanupStatus: 'pending', updatedAt: now })
      .where(
        and(
          eq(mediaPreviews.status, 'succeeded'),
          sql`${mediaPreviews.expiresAt} <= ${now.getTime()}`,
        ),
      )
      .run();
    const rows = runtime.db
      .select({ id: mediaPreviews.id })
      .from(mediaPreviews)
      .where(inArray(mediaPreviews.cleanupStatus, ['pending', 'failed']))
      .all();
    for (const row of rows)
      if (!active.has(row.id)) await cleanupPreview(runtime, row.id);
  }
  const ready = maintenance();
  function get(id: string) {
    let row = requirePreview(runtime, id);
    if (
      row.status === 'succeeded' &&
      row.expiresAt &&
      row.expiresAt.getTime() <= Date.now()
    ) {
      runtime.db
        .update(mediaPreviews)
        .set({
          status: 'expired',
          cleanupStatus: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(mediaPreviews.id, id))
        .run();
      row = requirePreview(runtime, id);
    }
    const { snapshot, ...publicRow } = row;
    void snapshot;
    return {
      ...publicRow,
      resultUrl:
        row.status === 'succeeded' && row.result
          ? `/api/media/previews/${id}/result`
          : null,
    };
  }
  return {
    ready,
    get,
    maintenance,
    async receive(request: Request) {
      await ready;
      if (stopping)
        throw previewError('MEDIA_INTERRUPTED', '服务正在停止', 409);
      const id = randomUUID();
      const now = new Date();
      runtime.db
        .insert(mediaPreviews)
        .values({
          id,
          status: 'receiving',
          cleanupStatus: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const controller = new AbortController();
      const execution = (async () => {
        try {
          const directory = pathFor(runtime, id);
          await mkdir(directory, { recursive: true });
          const { input } = await receivePreviewMultipart(request, {
            path: join(directory, 'source'),
            resources: (runtime.resources ??= createMediaResources()),
            maxBytes: requireUploadSettings(runtime.db).maxFileBytes,
            signal: controller.signal,
          });
          controller.signal.throwIfAborted();
          queuePreview(runtime, id, input);
          return get(id);
        } catch (error) {
          runtime.db
            .update(mediaPreviews)
            .set({
              status: controller.signal.aborted ? 'cancelled' : 'failed',
              error: analyzeMediaError(error).diagnostic,
              cleanupStatus: 'pending',
              finishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(mediaPreviews.id, id))
            .run();
          await cleanupPreview(runtime, id).catch((cleanupError: unknown) => {
            throw Object.assign(
              cleanupError instanceof Error
                ? cleanupError
                : new Error(String(cleanupError)),
              { previewId: id },
            );
          });
          throw Object.assign(
            error instanceof Error ? error : new Error(String(error)),
            { previewId: id },
          );
        }
      })();
      active.set(id, { controller, execution });
      try {
        return await execution;
      } finally {
        active.delete(id);
      }
    },
    run(id: string, signal: AbortSignal) {
      const controller = new AbortController();
      const execution = processMediaPreview(
        runtime,
        id,
        AbortSignal.any([signal, controller.signal]),
      );
      active.set(id, { controller, execution });
      return execution.finally(() => active.delete(id));
    },
    async cancel(id: string) {
      await ready;
      const row = requirePreview(runtime, id);
      const operation = active.get(id);
      if (operation) {
        operation.controller.abort(
          mediaError('MEDIA_CANCELLED', '所有者已取消预览'),
        );
        await operation.execution.catch((error: unknown) => {
          runtime.logger.error(
            { err: error, previewId: id },
            'Preview cancellation settlement failed',
          );
          if (
            (error as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED'
          )
            throw error;
        });
      }
      if (requirePreview(runtime, id).status !== 'expired') {
        runtime.db
          .update(mediaPreviews)
          .set({
            status: 'cancelled',
            result: null,
            cleanupStatus: 'pending',
            finishedAt: row.finishedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mediaPreviews.id, id))
          .run();
      }
      await cleanupPreview(runtime, id);
      return get(id);
    },
    async result(id: string) {
      const row = get(id);
      if (row.status === 'expired')
        throw previewError(
          'MEDIA_PREVIEW_EXPIRED',
          '预览已到期，请重新预览',
          410,
        );
      if (row.status !== 'succeeded' || !row.result)
        throw previewError(
          'MEDIA_PREVIEW_RESULT_UNAVAILABLE',
          row.unavailableReason ?? '预览结果尚不可用',
          409,
        );
      const resultPath = `${runtime.temporaryRoot}${sep}preview-${id}${sep}result`;
      const handle = await open(resultPath, 'r');
      return new Response(
        Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>,
        {
          headers: {
            'Content-Type': row.result.mime,
            'Content-Length': String(row.result.byteSize),
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            ...(row.result.mime === 'image/svg+xml'
              ? {
                  'Content-Disposition': contentDisposition('preview.svg', {
                    type: 'attachment',
                  }),
                }
              : {}),
          },
        },
      );
    },
    async stop() {
      stopping = true;
      for (const item of active.values())
        item.controller.abort(
          mediaError('MEDIA_INTERRUPTED', 'Web runtime is stopping'),
        );
      await Promise.allSettled(
        [...active.values()].map((item) => item.execution),
      );
      if (!runtime.db.$client.open) return;
      runtime.db
        .update(mediaPreviews)
        .set({
          status: 'cancelled',
          cleanupStatus: 'pending',
          error: 'MEDIA_INTERRUPTED: Web runtime is stopping',
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mediaPreviews.status, 'queued'))
        .run();
      await ready;
      if (runtime.db.$client.open) await maintenance();
    },
  };
}
