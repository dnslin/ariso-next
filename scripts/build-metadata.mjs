import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function writeBuildMetadata({ env, output }) {
  const version = env.ARISO_BUILD_VERSION || undefined;
  const revision = env.ARISO_BUILD_REVISION || undefined;
  let identity = null;
  if (version || revision) {
    if (
      !version ||
      !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(
        version,
      ) ||
      !revision ||
      !/^[0-9a-f]{40}$/.test(revision)
    ) {
      throw new Error(
        'Build identity requires a release version and full source revision',
      );
    }
    identity = { version, revision };
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(identity)}\n`);
  return identity;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  writeBuildMetadata({
    env: process.env,
    output: resolve('dist/build-info.json'),
  });
}
