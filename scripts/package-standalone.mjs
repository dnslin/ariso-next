import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readlink,
  symlink,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nft from 'next/dist/compiled/@vercel/nft/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.next/standalone');
// Reuse Next's tracer for the CLI graph, which is not reachable from Web routes.
const { fileList, warnings } = await nft.nodeFileTrace(
  ['dist/cli/prestart.js', 'dist/cli/logging.js'],
  {
    base: root,
    processCwd: root,
  },
);
for (const warning of warnings) console.warn(warning);
for (const file of fileList) {
  // Next has already written its package.json and standard server.js.
  if (file === 'package.json') continue;
  const source = join(root, file);
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  if ((await lstat(source)).isSymbolicLink()) {
    const link = await readlink(source);
    const destination = relative(
      dirname(source),
      resolve(dirname(source), link),
    );
    try {
      await symlink(destination, target);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  } else {
    await copyFile(source, target);
  }
}
for (const directory of ['drizzle', 'public', '.next/static']) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}
await cp(
  join(root, 'tests/fixtures/runtime/images'),
  join(output, 'verification/fixtures'),
  { recursive: true },
);
await copyFile(
  join(root, 'docker/entrypoint.sh'),
  join(output, 'entrypoint.sh'),
);
