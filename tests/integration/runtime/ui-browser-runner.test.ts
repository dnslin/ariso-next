import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { stop } from './process-helpers';

const runner = resolve('tests/experiments/ui/run-browser.mjs');

it.each(['missing', 'failed', 'cancelled'] as const)(
  'UI runner records %s browser failure and stops its server',
  async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), 'ariso-ui-runner-'));
    const output = join(directory, 'reports');
    const bin = join(directory, 'bin');
    const next = join(directory, 'node_modules/next/dist/bin');
    await Promise.all([
      mkdir(output),
      mkdir(bin),
      mkdir(next, { recursive: true }),
    ]);
    await writeFile(join(output, 'browser.json'), '{"status":"passed"}');
    // Real HTTP/process fixture: tests runner lifecycle, not Next or browser UI.
    await writeFile(
      join(next, 'next'),
      `
      const fs = require('node:fs');
      fs.writeFileSync('server.pid', String(process.pid));
      const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
      require('node:http').createServer((req, res) => res.end('ready')).listen(port, '127.0.0.1');
      console.log('Fixture server started');
    `,
    );
    if (scenario !== 'missing') {
      await writeFile(
        join(bin, 'ego-browser'),
        `#!${process.execPath}
        const fs = require('node:fs');
        fs.writeFileSync('browser.pid', String(process.pid));
        process.stdin.resume();
        process.stdin.on('end', () => {
          ${scenario === 'failed' ? "console.error('Fixture browser failure'); process.exitCode = 7;" : 'setInterval(() => {}, 1000);'}
        });
      `,
        { mode: 0o755 },
      );
    }
    const child = spawn(process.execPath, [runner], {
      cwd: directory,
      env: { NODE_ENV: 'test', PATH: bin, BROWSER_REPORT_DIR: output },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', (chunk) => {
      logs += chunk;
    });
    child.stderr.on('data', (chunk) => {
      logs += chunk;
    });
    const closed = once(child, 'close');
    try {
      if (scenario === 'cancelled') {
        await expect
          .poll(() => readFile(join(directory, 'browser.pid'), 'utf8'), {
            timeout: 5000,
          })
          .toMatch(/^\d+$/);
        child.kill('SIGTERM');
      }
      const [code] = await closed;
      expect(code, logs).toBe(1);
      const serverPid = Number(
        await readFile(join(directory, 'server.pid'), 'utf8'),
      );
      expect(
        () => process.kill(serverPid, 0),
        'server must not survive runner',
      ).toThrow();
      if (scenario === 'cancelled') {
        const browserPid = Number(
          await readFile(join(directory, 'browser.pid'), 'utf8'),
        );
        expect(() => process.kill(browserPid, 0)).toThrow();
      }
      const report = JSON.parse(
        await readFile(join(output, 'runner.json'), 'utf8'),
      );
      expect(report.status).toBe('failed');
      expect(report.error).toContain(
        scenario === 'missing'
          ? 'ENOENT'
          : scenario === 'failed'
            ? 'UI browser verification failed'
            : 'abort',
      );
      await expect(
        readFile(join(output, 'browser.json'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(join(output, 'server.log'), 'utf8')).toContain(
        'Fixture server started',
      );
      expect(await readFile(join(output, 'ego.log'), 'utf8')).toBeTypeOf(
        'string',
      );
    } finally {
      await stop(child, closed);
      await rm(directory, { recursive: true, force: true });
    }
  },
  15000,
);
