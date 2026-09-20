// EV-STORAGE-LOCAL experiment only; not a production storage API.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, fstatSync } from 'node:fs';
import { realpath, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

export async function controlledDirectory(root: string, input: string) {
  assert.ok(
    input && !input.includes('\0') && !isAbsolute(input),
    `Invalid path: ${input}`,
  );
  const actualRoot = await realpath(root);
  const candidate = resolve(actualRoot, input);
  const inside = (path: string) => {
    const part = relative(actualRoot, path);
    return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
  };
  assert.ok(inside(candidate), `Outside storage root: ${candidate}`);
  const actual = await realpath(candidate);
  assert.ok(inside(actual), `Outside storage root: ${candidate} -> ${actual}`);
  return actual;
}

export type Phase = 'copying' | 'before-publish' | 'published';
export async function publishExperiment(
  source: string,
  directory: string,
  journal: string,
  cancelAt?: Phase,
) {
  const id = randomUUID();
  const paths = {
    source,
    temporary: join(directory, `${id}.partial`),
    target: join(directory, `${id}.object`),
  };
  // Written before I/O on the source volume, so a full destination cannot erase responsibility.
  // Keeping both candidate paths also covers an interruption after rename.
  await writeFile(journal, JSON.stringify(paths), { flag: 'wx' });
  const controller = new AbortController();
  const input = createReadStream(source, { highWaterMark: 64 * 1024 });
  const output = createWriteStream(paths.temporary, {
    flags: 'wx',
    highWaterMark: 64 * 1024,
  });
  const descriptors: number[] = [];
  input.once('open', (fd) => descriptors.push(fd));
  output.once('open', (fd) => descriptors.push(fd));
  if (cancelAt === 'copying') output.once('drain', () => controller.abort());
  let failure: unknown;
  try {
    await pipeline(input, output, { signal: controller.signal });
    if (cancelAt === 'before-publish') controller.abort();
    controller.signal.throwIfAborted();
    await rename(paths.temporary, paths.target);
    // A completed publish must still be handed off even if cancellation arrives now.
    if (cancelAt === 'published') controller.abort();
  } catch (cause) {
    failure = new Error(`Stream publish failed: ${JSON.stringify(paths)}`, {
      cause,
    });
  }
  assert.ok(
    input.closed && output.closed,
    'Both file streams must close before returning',
  );
  for (const fd of descriptors)
    assert.throws(() => fstatSync(fd), { code: 'EBADF' });
  return { paths, failure, bytesWritten: output.bytesWritten, closed: true };
}
