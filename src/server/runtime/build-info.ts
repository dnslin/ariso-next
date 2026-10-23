import { resolve } from 'node:path';

export type BuildIdentity = { version: string; revision: string };

// Metadata is packaged explicitly; Node reads its runtime path outside Next's asset graph.
const { readFileSync } = process.getBuiltinModule('node:fs');

/** A development build is usable, but cannot claim a release-compatible backup. */
export function readBuildIdentity(
  file = resolve('dist/build-info.json'),
): BuildIdentity | null {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const value: unknown = JSON.parse(source);
  if (value === null) return null;
  if (
    typeof value !== 'object' ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(
      value.version,
    ) ||
    !('revision' in value) ||
    typeof value.revision !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.revision)
  ) {
    throw new Error(`Invalid build identity: ${file}`);
  }
  return { version: value.version, revision: value.revision };
}
