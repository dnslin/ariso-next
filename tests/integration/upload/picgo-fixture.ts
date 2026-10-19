import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { PicGo as PicGoClient } from '../../../integrations/picgo/node_modules/picgo';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

export type PicgoConfig = {
  siteUrl: string;
  token: string;
  storageId?: string;
  albumId?: string;
  tag?: string;
  linkVersion?: 'site' | 'original' | 'compressed' | 'watermark';
  timeoutSeconds?: number;
};

/** Install the actual distributable, then let Core discover it as a normal plugin. */
export async function packagedPicgo() {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-picgo-package-'));
  try {
    const npm = join(dirname(process.execPath), 'npm');
    const cache = join(directory, 'npm-cache');
    const { stdout } = await execute(
      npm,
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--cache',
        cache,
        '--pack-destination',
        directory,
      ],
      { cwd: resolve('integrations/picgo'), maxBuffer: 1024 * 1024 },
    );
    const [packed] = JSON.parse(stdout) as {
      filename: string;
      files: { path: string }[];
    }[];
    const files = packed.files.map((file) => file.path).sort();
    assert.ok(files.includes('index.cjs'), 'Packed plugin has no entry point');
    assert.ok(
      files.every((file) =>
        /^(?:index\.cjs|lib\/[^/]+\.cjs|LICENSE|README\.md|package\.json)$/.test(
          file,
        ),
      ),
      `Unexpected published files: ${files.join(', ')}`,
    );
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'picgo-292-acceptance', private: true }),
    );
    await execute(
      npm,
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        '--offline',
        '--cache',
        cache,
        join(directory, packed.filename),
      ],
      { cwd: directory, maxBuffer: 1024 * 1024 },
    );
    const manifest = JSON.parse(
      await readFile(
        join(directory, 'node_modules/picgo-plugin-ariso/package.json'),
        'utf8',
      ),
    );
    assert.equal(manifest.name, 'picgo-plugin-ariso');
    assert.deepEqual(manifest.dependencies ?? {}, {});
    const { PicGo } = require(
      resolve('integrations/picgo/node_modules/picgo'),
    ) as { PicGo: typeof PicGoClient };
    let client: PicGoClient | undefined;
    let failedListener: ((error: Error) => void) | undefined;
    let finishedListener: ((context: unknown) => void) | undefined;
    return {
      directory,
      files,
      createClient(config: PicgoConfig) {
        // Core has no disposal API for its global configuration listener. Reuse one
        // client for these sequential scenarios instead of accumulating instances.
        if (!client) {
          client = new PicGo(join(directory, 'config.json'));
          client.log = client.log.createLogger({ consoleOutput: false });
        }
        if (failedListener) client.off('failed', failedListener);
        if (finishedListener) client.off('finished', finishedListener);
        assert.equal(client.VERSION, '3.1.0');
        assert.equal(client.pluginLoader.hasPlugin('picgo-plugin-ariso'), true);
        assert.ok(client.helper.uploader.get('ariso'));
        client.setConfig({
          'picBed.current': 'ariso',
          'picBed.uploader': 'ariso',
          'picBed.transformer': 'path',
          'picBed.ariso': config,
        });
        const errors: Error[] = [];
        const finished: unknown[] = [];
        failedListener = (error: Error) => {
          errors.push(error);
        };
        finishedListener = (context: unknown) => {
          finished.push(context);
        };
        client.on('failed', failedListener);
        client.on('finished', finishedListener);
        return { client, errors, finished };
      },
      async close() {
        client?.server.shutdown();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
