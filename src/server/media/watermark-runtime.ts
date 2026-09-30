import { setTimeout as delay } from 'node:timers/promises';
import type { Logger } from 'pino';
import {
  cleanupWatermarkAssets,
  createWatermarkAsset,
  recoverWatermarkAssets,
  type WatermarkContext,
} from './watermark-assets.ts';
import { readWatermarkUpload } from './watermark-http.ts';
import { mediaError } from './errors.ts';

export function startWatermarkRuntime(
  context: WatermarkContext & { logger: Pick<Logger, 'error'> },
) {
  const stopping = new AbortController();
  const active = new Set<Promise<unknown>>();
  recoverWatermarkAssets(context.db);
  const maintenance = (async () => {
    while (!stopping.signal.aborted) {
      for (const failure of await cleanupWatermarkAssets(context))
        context.logger.error(
          { err: failure.error, assetId: failure.id },
          'Watermark cleanup failed',
        );
      try {
        await delay(60_000, undefined, { signal: stopping.signal, ref: false });
      } catch (error) {
        if (!stopping.signal.aborted) throw error;
      }
    }
  })();
  void maintenance.catch((err: unknown) =>
    context.logger.error({ err }, 'Watermark maintenance stopped'),
  );
  return {
    receive(request: Request) {
      if (stopping.signal.aborted)
        throw Object.assign(mediaError('MEDIA_STOPPING', '服务正在停止'), {
          status: 503,
        });
      const signal = AbortSignal.any([
        stopping.signal,
        request.signal,
        AbortSignal.timeout(120_000),
      ]);
      const operation = readWatermarkUpload(request, signal)
        .then((bytes) => createWatermarkAsset(context, bytes, signal))
        .finally(() => active.delete(operation));
      active.add(operation);
      return operation;
    },
    async stop() {
      stopping.abort(mediaError('MEDIA_INTERRUPTED', '服务正在停止'));
      await Promise.allSettled([...active]);
      await maintenance;
    },
  };
}
