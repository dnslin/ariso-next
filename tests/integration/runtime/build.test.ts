import { constants } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execa } from 'execa';
import { expect, it } from 'vitest';

it('无密钥和数据库时在独立目录完成生产构建，不写数据或输出初始化码', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-build-'));
  const app = join(directory, 'app');
  const data = join(directory, 'data');
  try {
    // Include current edits, but never local environment files or generated output.
    const { stdout } = await execa('git', [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
    ]);
    for (const file of stdout.split('\0').filter(Boolean)) {
      if (file.startsWith('.env')) continue;
      await mkdir(dirname(join(app, file)), { recursive: true });
      await cp(resolve(file), join(app, file));
    }
    // Copy rather than link: Turbopack and the CLI tracer stay inside this workspace.
    await cp(resolve('node_modules'), join(app, 'node_modules'), {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: data,
    };
    delete env.BETTER_AUTH_SECRET;
    delete env.ARISO_ENCRYPTION_KEY;
    await expect(lstat(data)).rejects.toMatchObject({ code: 'ENOENT' });
    const result = await execa('pnpm', ['run', 'build'], {
      cwd: app,
      env,
      extendEnv: false,
      all: true,
      reject: false,
      timeout: 180_000,
      killDescendants: true,
    });
    expect(result.exitCode, result.all).toBe(0);
    expect(result.all).not.toMatch(
      /初始化码|(?:setup|initialization)[ _-]*code/i,
    );
    await expect(lstat(data)).rejects.toMatchObject({ code: 'ENOENT' });
    for (const file of [
      '.next/BUILD_ID',
      '.next/standalone/server.js',
      '.next/standalone/dist/cli/prestart.js',
      '.next/standalone/entrypoint.sh',
      '.next/standalone/public/runtime.svg',
    ]) {
      expect((await lstat(join(app, file))).isFile(), file).toBe(true);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 240_000);
