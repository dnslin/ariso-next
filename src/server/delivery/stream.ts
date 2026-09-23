import type { ReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';

/** No Web queue: constructing a Response must not start delivery or counting. */
export function responseStream(
  source: ReadStream,
  signal: AbortSignal,
  onStart: () => void,
  onError: (error: unknown) => void,
) {
  const iterator = source[Symbol.asyncIterator]();
  let started = false;
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
          signal.throwIfAborted();
          const next = await iterator.next();
          if (next.done) controller.close();
          else {
            controller.enqueue(next.value);
            if (!started) {
              started = true;
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
