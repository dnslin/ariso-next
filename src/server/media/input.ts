import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { identifyImageFile } from './file-formats.ts';

type Identification = Awaited<ReturnType<typeof identifyImageFile>>;

function inputDirectory(temporaryRoot: string, jobId: string) {
  return join(temporaryRoot, `media-input-${jobId}`);
}

/** Upload retains ownership until the transaction creates this exact media job. */
export async function retainMediaInput(
  temporaryRoot: string,
  jobId: string,
  path: string,
  facts: Identification,
) {
  const directory = inputDirectory(temporaryRoot, jobId);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'identification.json'),
    JSON.stringify(facts),
  );
  const target = join(directory, 'original');
  await rename(path, target);
  return target;
}

export async function discardMediaInput(temporaryRoot: string, jobId: string) {
  await rm(inputDirectory(temporaryRoot, jobId), {
    recursive: true,
    force: true,
  });
}

export async function readMediaInput(temporaryRoot: string, jobId: string) {
  const directory = inputDirectory(temporaryRoot, jobId);
  let content: string;
  try {
    content = await readFile(join(directory, 'identification.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return {
    path: join(directory, 'original'),
    facts: JSON.parse(content) as Identification,
  };
}
