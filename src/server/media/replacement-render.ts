import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { startDerivedEncoding } from './processing.ts';

/** Watermark recipes may differ from the separately published compression recipe. */
export async function replacementCompression(
  options: Omit<
    Parameters<typeof startDerivedEncoding>[0],
    'kind' | 'compressedPath'
  >,
  countOutput: (source: Readable) => Readable,
) {
  const path = join(
    options.workspace,
    'replacement-watermark-source.' + options.snapshot.outputFormat,
  );
  const controller = new AbortController();
  const tool = await startDerivedEncoding({
    ...options,
    kind: 'compressed',
    signal: AbortSignal.any([options.signal, controller.signal]),
  });
  try {
    await pipeline(
      countOutput(tool.child.readable()),
      createWriteStream(path),
      { signal: options.signal },
    );
  } catch (error) {
    controller.abort();
    const toolError = await tool.settled;
    if (toolError && !('isCanceled' in toolError && toolError.isCanceled))
      throw toolError;
    throw error;
  }
  const error = await tool.settled;
  if (error) throw error;
  return path;
}
