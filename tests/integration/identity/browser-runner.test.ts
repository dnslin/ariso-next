import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

function signalGroup(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    return false;
  }
}

it('browser runner cancels on SIGINT and SIGTERM, stops real Next, removes its database and can restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-runner-cancel-'));
  try {
    // Each runner uses its own Next app, so other HTTP tests can run in parallel.
    for (const path of [
      'tests/experiments/identity',
      'tests/integration/runtime/process-helpers.ts',
      'src/server/runtime/db.ts',
      'tsconfig.json',
      'package.json',
    ]) {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await cp(resolve(path), join(directory, path), {
        recursive: true,
        filter: (source) => !source.split('/').includes('.next'),
      });
    }
    await symlink(resolve('node_modules'), join(directory, 'node_modules'));
    const bin = join(directory, 'bin');
    await mkdir(bin);
    // Only the external browser command is replaced. Next and SQLite are real.
    await writeFile(
      join(bin, 'ego-browser'),
      `#!/bin/sh\nexec "${process.execPath}" "${resolve('tests/fixtures/identity/blocked-browser.mjs')}"\n`,
      { mode: 0o755 },
    );
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const marker = join(directory, `${signal}.json`);
      const child = spawn(
        process.execPath,
        ['tests/experiments/identity/run-browser.ts'],
        {
          cwd: directory,
          detached: true,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            BROWSER_STARTED: marker,
            BROWSER_REPORT_DIR: join(directory, 'report'),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let logs = '';
      child.stdout.on('data', (chunk) => {
        logs += chunk;
      });
      child.stderr.on('data', (chunk) => {
        logs += chunk;
      });
      const exited = once(child, 'exit');
      let nextPid: number | undefined;
      let config: { configPath: string; port: number; pid: number } | undefined;
      try {
        await vi.waitFor(() => expect(existsSync(marker), logs).toBe(true), {
          timeout: 45000,
        });
        config = JSON.parse(await readFile(marker, 'utf8'));
        const processes = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], {
          encoding: 'utf8',
        });
        const next = processes.split('\n').find((line) => {
          const [, , parent, command] =
            line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/) ?? [];
          return Number(parent) === child.pid && command?.includes('next');
        });
        expect(next, processes).toBeDefined();
        nextPid = Number(next!.trim().split(/\s+/)[0]);
        expect(existsSync(config!.configPath)).toBe(true);
        expect(
          (
            await fetch(`http://127.0.0.1:${config!.port}/`, {
              signal: AbortSignal.timeout(30000),
            })
          ).status,
        ).toBe(200);
        child.kill(signal);
        await vi.waitFor(
          () =>
            expect(
              child.exitCode !== null || child.signalCode !== null,
              logs,
            ).toBe(true),
          { timeout: 15000 },
        );
        const [code] = await exited;
        expect(code).not.toBe(0);
        await vi.waitFor(
          () => {
            expect(alive(nextPid!)).toBe(false);
            expect(alive(config!.pid)).toBe(false);
            expect(existsSync(dirname(config!.configPath))).toBe(false);
          },
          { timeout: 10000 },
        );
        await expect(
          fetch(`http://127.0.0.1:${config!.port}/`, {
            signal: AbortSignal.timeout(1000),
          }),
        ).rejects.toThrow();
      } finally {
        signalGroup(nextPid);
        signalGroup(child.pid);
        await exited;
        if (config)
          await rm(dirname(config.configPath), {
            recursive: true,
            force: true,
          });
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 150000);
