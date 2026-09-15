import { accessSync, constants, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** dataDir 来自已校验的 RuntimeConfig；仅显式调用时创建目录。 */
export function initializeRuntimePaths(dataDir: string) {
  const paths = {
    dataDir,
    database: join(dataDir, 'ariso.db'),
    storage: join(dataDir, 'storage'),
    assets: join(dataDir, 'assets'),
    watermarks: join(dataDir, 'assets', 'watermarks'),
    branding: join(dataDir, 'assets', 'branding'),
    tmp: join(dataDir, 'tmp'),
  };
  for (const directory of [
    paths.dataDir,
    paths.storage,
    paths.assets,
    paths.watermarks,
    paths.branding,
    paths.tmp,
  ]) {
    mkdirSync(directory, { recursive: true });
    accessSync(directory, constants.W_OK);
  }
  return paths;
}
