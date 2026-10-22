import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { MediaRuntime } from './process.ts';
import type { planDerivedObject } from './objects.ts';
import { startDerivedEncoding } from './processing.ts';
import { activeMediaJob } from './steps.ts';
import { readMediaObject, writeMediaObject } from './storage.ts';
import { inspectImage } from './formats.ts';
import { mediaError } from './errors.ts';

/** Persist and inspect one encoded candidate; callers retain publication ownership. */
export async function writeEncodedCandidate(
  runtime: MediaRuntime,
  jobId: string,
  plan: ReturnType<typeof planDerivedObject>,
  options: Parameters<typeof startDerivedEncoding>[0],
  outputPath: string,
  countOutput: (source: Readable) => Readable,
) {
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  const { child, settled } = await startDerivedEncoding({ ...options, signal });
  const format =
    options.kind === 'thumbnail' ? 'webp' : options.snapshot.outputFormat;
  const mime = `image/${format}`;
  const encoded = countOutput(child.readable());
  // Storage can reject before attaching a reader; observe disposal as well.
  const encodedClosed = finished(encoded, { cleanup: true }).catch(
    () => undefined,
  );
  let saved: Awaited<ReturnType<typeof writeMediaObject>>;
  try {
    const { storage } = activeMediaJob(runtime.db, jobId);
    saved = await writeMediaObject(
      runtime,
      storage,
      plan,
      encoded,
      mime,
      outputPath,
      signal,
    );
  } catch (error) {
    controller.abort();
    encoded.destroy();
    await encodedClosed;
    const toolError = await settled;
    if (
      toolError &&
      'code' in toolError &&
      toolError.code === 'MEDIA_TOOL_SHUTDOWN_FAILED'
    )
      throw toolError;
    // Aborting for disposal must not replace a real storage failure.
    if (options.signal.aborted) throw options.signal.reason;
    let cause = error;
    while (cause instanceof Error && cause.cause instanceof Error)
      cause = cause.cause;
    const code = (cause as NodeJS.ErrnoException)?.code;
    if (
      toolError &&
      !('isCanceled' in toolError && toolError.isCanceled) &&
      (code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'EPIPE')
    )
      throw toolError;
    throw error;
  }
  const toolError = await settled;
  if (toolError) throw toolError;
  const { storage } = activeMediaJob(runtime.db, jobId);
  const output = saved.path
    ? { stream: createReadStream(saved.path) }
    : await readMediaObject(runtime, storage, saved.key, mime, options.signal);
  const facts = await inspectImage(
    output.stream,
    options.workspace,
    options.signal,
  );
  if (facts.mime !== mime)
    throw mediaError(
      'MEDIA_OUTPUT_INVALID',
      `Unexpected derived encoding: ${facts.format}`,
    );
  return { saved, facts };
}
