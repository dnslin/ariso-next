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
import { waitForSettled } from '../runtime/idle.ts';

export function startWatermarkRuntime(
  context: WatermarkContext & { logger: Pick<Logger, 'error'> },
) {
  const stopping = new AbortController();
  const active = new Set<Promise<unknown>>();
  let paused = false;
  let cleaning: ReturnType<typeof cleanupWatermarkAssets> | undefined;
  recoverWatermarkAssets(context.db);
  const maintenance = (async () => {
    while (!stopping.signal.aborted) {
      if (!paused) {
        cleaning = cleanupWatermarkAssets(context);
        for (const failure of await cleaning)
          context.logger.error(
            { err: failure.error, assetId: failure.id },
            'Watermark cleanup failed',
          );
        cleaning = undefined;
      }
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
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    waitForIdle(signal?: AbortSignal) {
      return waitForSettled(
        [...active, ...(cleaning ? [cleaning] : [])],
        signal,
      );
    },
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
