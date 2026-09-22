import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  startMediaTool,
  terminateMediaTools,
} from '../../../src/server/media/tools.ts';

let directory: string;
let workspace: string;
let bin: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-tools-'));
  workspace = join(directory, 'workspace');
  bin = join(directory, 'bin');
  await Promise.all([mkdir(workspace), mkdir(bin)]);
  // Real OS processes stand in for a codec that is slow or ignores SIGTERM.
  const script = `#!${process.execPath}
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
if (process.env.IGNORE_TERM) process.on('SIGTERM', () => {});
const workspace = process.argv.find(arg => arg.startsWith('registry:temporary-path=') || arg.startsWith('ArisoWorkspace=')).split('=').slice(1).join('=');
if (process.env.SPAWN_DESCENDANT) spawn(process.execPath, ['-e', "const fs=require('node:fs');const path=require('node:path');process.on('SIGTERM',()=>{});fs.writeFileSync(path.join(process.argv[1],'descendant-ready'),String(process.pid));let i=0;setInterval(()=>fs.writeFileSync(path.join(process.argv[1],'descendant-cache'),String(++i)),10)", workspace], {stdio:'ignore'});
writeFileSync(join(workspace, 'ready'), String(process.pid));
let count = 0;
setInterval(() => writeFileSync(join(workspace, 'cache'), String(++count)), 10);
`;
  await Promise.all(
    ['magick', 'exiftool'].map((tool) =>
      writeFile(join(bin, tool), script, { mode: 0o755 }),
    ),
  );
});
afterEach(async () => {
  await terminateMediaTools(workspace);
  await rm(directory, { recursive: true, force: true });
});

async function ready(path = workspace) {
  await expect
    .poll(async () => readFile(join(path, 'ready'), 'utf8'), { timeout: 3000 })
    .toMatch(/^\d+$/);
}

async function expectWritesStopped() {
  // Awaiting termination may precede the first write for very fast cancellation.
  const before = await readFile(join(workspace, 'cache'), 'utf8').catch(
    (error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    },
  );
  await delay(100);
  const after = await readFile(join(workspace, 'cache'), 'utf8').catch(
    (error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    },
  );
  expect(after).toBe(before);
  const pid = Number(await readFile(join(workspace, 'ready'), 'utf8'));
  const { stdout } = await execa('ps', ['-axo', 'pid=,stat=']);
  expect(
    stdout.split('\n').some((line) => {
      const fields = line.trim().split(/\s+/);
      return Number(fields[0]) === pid && !fields[1]?.startsWith('Z');
    }),
  ).toBe(false);
}

const env = () => ({ PATH: `${bin}:${process.env.PATH}` });

describe('media tool lifecycle', () => {
  it('preserves process-inspection failures as shutdown failures for recovery', async () => {
    const originalPath = process.env.PATH;
    await writeFile(join(bin, 'ps'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });
    process.env.PATH = `${bin}:${originalPath}`;
    try {
      await expect(terminateMediaTools(workspace)).rejects.toMatchObject({
        code: 'MEDIA_TOOL_SHUTDOWN_FAILED',
        cause: { exitCode: 3 },
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it.each(['magick', 'exiftool'] as const)(
    'kills %s after cancellation even when it ignores SIGTERM',
    async (command) => {
      const controller = new AbortController();
      const { settled } = startMediaTool(command, [], {
        workspace,
        env: { ...env(), IGNORE_TERM: '1' },
        cancelSignal: controller.signal,
      });
      await ready();
      const start = Date.now();
      controller.abort();
      expect(await settled).toMatchObject({ isCanceled: true });
      expect(Date.now() - start).toBeLessThan(5000);
      await expectWritesStopped();
    },
  );

  it('waits for descendants that ignore SIGTERM after the leader has exited', async () => {
    const controller = new AbortController();
    const { settled } = startMediaTool('magick', [], {
      workspace,
      env: { ...env(), SPAWN_DESCENDANT: '1' },
      cancelSignal: controller.signal,
    });
    await expect
      .poll(async () => readFile(join(workspace, 'descendant-ready'), 'utf8'))
      .toMatch(/^\d+$/);
    controller.abort();
    expect(await settled).toMatchObject({ isCanceled: true });
    const before = await readFile(join(workspace, 'descendant-cache'), 'utf8');
    await delay(100);
    expect(await readFile(join(workspace, 'descendant-cache'), 'utf8')).toBe(
      before,
    );
    await expectWritesStopped();
  });

  it('terminates a timed-out process and preserves the timeout diagnostic', async () => {
    const { settled } = startMediaTool('magick', [], {
      workspace,
      env: { ...env(), IGNORE_TERM: '1' },
      timeout: 1500,
    });
    await ready();
    expect(await settled).toMatchObject({ timedOut: true });
    await expectWritesStopped();
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)(
    'recovers tools left by a parent receiving %s',
    async (signal) => {
      const script = join(directory, 'parent.mjs');
      await writeFile(
        script,
        `
import {startMediaTool} from ${JSON.stringify(resolve('src/server/media/tools.ts'))};
const controller = new AbortController();
const {settled} = startMediaTool('magick', [], {
  workspace: process.argv[2],
  cancelSignal: controller.signal,
  env: {IGNORE_TERM: '1'},
});
process.on('SIGTERM', async () => {
  controller.abort();
  await settled;
  process.exit(0);
});
await settled;
`,
      );
      const parent = execa(process.execPath, [script, workspace], {
        env: env(),
      });
      const parentSettled = parent.catch((error) => error);
      try {
        await ready();
        parent.kill(signal);
        await parentSettled;
        if (signal === 'SIGKILL') {
          const orphanPid = Number(
            await readFile(join(workspace, 'ready'), 'utf8'),
          );
          expect(() => process.kill(orphanPid, 0)).not.toThrow();
        }
        await terminateMediaTools(workspace);
        await expectWritesStopped();
      } finally {
        parent.kill('SIGKILL');
        await parentSettled;
      }
    },
  );

  it('does not terminate a process whose workspace only shares the same prefix', async () => {
    const otherWorkspace = `${workspace}-other`;
    await mkdir(otherWorkspace);
    const { child, settled } = startMediaTool('exiftool', [], {
      workspace: otherWorkspace,
      env: env(),
    });
    try {
      await ready(otherWorkspace);
      await terminateMediaTools(workspace);
      expect(() => process.kill(child.pid!, 0)).not.toThrow();
    } finally {
      await terminateMediaTools(otherWorkspace);
      await settled;
    }
  });
});
