/** Cancels the caller's wait, without aborting work owned by another request. */
export async function waitWithSignal<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!signal) return operation;
  let rejectCancelled!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectCancelled = reject;
  });
  const abort = () => rejectCancelled(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** Each operation reports its own failure; the snapshot boundary needs settlement. */
export async function waitForSettled(
  operations: Iterable<Promise<unknown>>,
  signal?: AbortSignal,
) {
  await waitWithSignal(Promise.allSettled(operations), signal);
}
