import type { ReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';

/** Experiment adapter: no Web queue means constructing Response cannot start delivery. */
export function responseStream(
  source: ReadStream,
  signal: AbortSignal,
  onStart: () => void,
  onError: (error: unknown) => void,
  beforeRead: (chunks: number) => Promise<void> = async () => {},
) {
  const iterator = source[Symbol.asyncIterator]();
  let chunks = 0;
  let cancelled = false;
  const closed = finished(source, { cleanup: true }).catch((error: unknown) => {
    if (!cancelled) onError(error);
  });
  const abort = () => {
    cancelled = true;
    source.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  void closed.finally(() => signal.removeEventListener('abort', abort));
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          await beforeRead(chunks);
          signal.throwIfAborted();
          const next = await iterator.next();
          if (next.done) {
            controller.close();
          } else {
            controller.enqueue(next.value);
            if (chunks++ === 0) {
              try {
                onStart();
              } catch (error) {
                onError(error);
              }
            }
          }
        } catch (error) {
          source.destroy();
          if (!cancelled) onError(error);
          controller.error(error);
        }
      },
      async cancel() {
        abort();
        await closed;
      },
    },
    { highWaterMark: 0 },
  );
}
