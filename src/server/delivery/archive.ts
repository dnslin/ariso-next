import { randomUUID } from 'node:crypto';
import { create as contentDisposition } from 'content-disposition';
import type { Logger } from 'pino';
import type {
  ArchivePreparation,
  ArchiveRequest,
} from '../library/archive-types.ts';
import { LibraryQueryError } from '../library/query-schema.ts';
import {
  deliveryError,
  deliveryErrors,
  isDeliveryErrorCode,
} from './errors.ts';
import { sameSignedTarget } from './s3.ts';
import {
  archiveSelection,
  closeArchiveSource,
  openArchiveObject,
  parseArchiveRequest,
  selectArchiveTarget,
  type ArchiveStorage,
  type ArchiveTarget,
} from './archive-selection.ts';
import { streamArchive } from './archive-stream.ts';

export function createArchiveService(
  options: ArchiveStorage & { logger: Pick<Logger, 'error'> },
) {
  const lists = new Map<string, { input: ArchiveRequest; expiresAt: number }>();
  const active = new Set<ReturnType<typeof streamArchive>>();
  const pending = new Set<AbortController>();
  let stopped = false;
  function available() {
    if (stopped)
      throw new LibraryQueryError(
        '下载服务正在停止，请稍后重试',
        'ARCHIVE_STOPPING',
        503,
      );
    for (const [id, list] of lists)
      if (list.expiresAt <= Date.now()) lists.delete(id);
  }

  async function check(input: ArchiveRequest, signal: AbortSignal) {
    const selection = archiveSelection(options, input);
    const targets: ArchiveTarget[] = [];
    const result: ArchivePreparation = {
      items: [],
      unavailable: [],
      totalBytes: 0,
      downloadUrl: null,
      expiresAt: null,
    };
    const names = new Set<string>();
    for (const imageId of input.ids) {
      signal.throwIfAborted();
      let displayName = imageId;
      try {
        const target = selectArchiveTarget(options, input, imageId, names);
        displayName = target.image.displayName;
        if (!selection.has(imageId))
          throw new LibraryQueryError(
            '图片已不属于当前筛选范围',
            'ARCHIVE_SELECTION_CHANGED',
            409,
          );
        const opened = await openArchiveObject(options, target, signal);
        await closeArchiveSource(opened.stream);
        signal.throwIfAborted();
        if (
          opened.size !== target.version.byteSize ||
          opened.size !== target.object.byteSize
        )
          throw new Error(
            `Archive object size mismatch: ${target.object.id}, actual=${opened.size}`,
          );
        const current = selectArchiveTarget(options, input, imageId, new Set());
        if (!sameSignedTarget(target, current))
          throw deliveryError('IMAGE_CHANGED');
        targets.push(target);
        result.items.push({
          imageId,
          displayName,
          filename: target.filename,
          byteSize: opened.size,
        });
        result.totalBytes += opened.size;
      } catch (err) {
        signal.throwIfAborted();
        const code =
          err instanceof Error && 'code' in err && isDeliveryErrorCode(err.code)
            ? err.code
            : null;
        if (
          !(err instanceof LibraryQueryError) &&
          (!code || code.startsWith('STORAGE_'))
        )
          options.logger.error({ err, imageId }, 'Archive source check failed');
        result.unavailable.push({
          imageId,
          displayName,
          reason: code
            ? deliveryErrors[code][1]
            : err instanceof LibraryQueryError
              ? err.message
              : '文件无法读取，请检查存储后重试',
        });
      }
    }
    return { result, targets };
  }

  async function checked(input: ArchiveRequest, signal?: AbortSignal) {
    available();
    const controller = new AbortController();
    pending.add(controller);
    try {
      return await check(
        input,
        signal
          ? AbortSignal.any([signal, controller.signal])
          : controller.signal,
      );
    } finally {
      pending.delete(controller);
    }
  }

  return {
    async prepare(
      value: unknown,
      signal?: AbortSignal,
    ): Promise<ArchivePreparation> {
      const input = parseArchiveRequest(value);
      const { result } = await checked(input, signal);
      available();
      if (!result.unavailable.length && result.items.length) {
        const id = randomUUID();
        const expiresAt = Date.now() + 600_000;
        lists.set(id, { input, expiresAt });
        result.downloadUrl = `/api/images/archives/${id}`;
        result.expiresAt = new Date(expiresAt).toISOString();
      }
      return result;
    },
    async download(
      id: string,
      request: Request,
      readOwner: () => Promise<void>,
    ) {
      await readOwner();
      available();
      const list = lists.get(id);
      if (!list)
        throw new LibraryQueryError(
          '下载清单已失效，请重新检查并准备下载',
          'ARCHIVE_EXPIRED',
          410,
        );
      const { result, targets } = await checked(list.input, request.signal);
      if (result.unavailable.length)
        throw new LibraryQueryError(
          '下载清单中的图片已不可用，请重新检查',
          'ARCHIVE_UNAVAILABLE',
          409,
        );
      await readOwner();
      available();
      request.signal.throwIfAborted();
      const stream = streamArchive(
        options,
        list.input,
        targets,
        request,
        readOwner,
      );
      active.add(stream);
      void stream.closed.then(() => active.delete(stream));
      const filename = `Ariso-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-')}.zip`;
      return new Response(stream.body, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': contentDisposition(filename),
          'Cache-Control': 'private, no-store, no-transform',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
    async close() {
      stopped = true;
      lists.clear();
      for (const controller of pending) controller.abort();
      for (const stream of active) stream.stop();
      await Promise.all([...active].map((stream) => stream.closed));
    },
  };
}
