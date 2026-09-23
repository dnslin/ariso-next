import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const fixture = fileURLToPath(new URL('.', import.meta.url));
const runner = fileURLToPath(new URL('./run-browser.mjs', import.meta.url));
for (const phase of ['server', 'browser']) {
  test(
    `${phase} startup failure replaces a previous passed report`,
    { timeout: 10000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'upload-runner-'));
      const output = join(root, 'report');
      const bin = join(root, 'bin');
      await mkdir(output);
      await mkdir(bin);
      await writeFile(
        join(output, 'browser.json'),
        JSON.stringify({
          status: 'passed',
          startedAt: 'old-run',
          phases: ['old-evidence'],
        }),
      );
      // Deliberately failing CLI fixture: this tests orchestration, not a browser.
      await writeFile(
        join(bin, 'ego-browser'),
        `#!${process.execPath}\nconst fs = require('node:fs');\nprocess.stdin.resume();\nprocess.stdin.on('end', () => {\n const report = JSON.parse(fs.readFileSync(process.env.BROWSER_REPORT_DIR + '/browser.json'));\n if (report.status !== 'running' || report.phases.length) process.exit(9);\n console.error('controlled browser startup failure');\n process.exit(7);\n});\n`,
        { mode: 0o755 },
      );
      const child = spawn(process.execPath, [runner], {
        cwd: phase === 'server' ? root : fixture,
        env: { ...process.env, PATH: bin, BROWSER_REPORT_DIR: output },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let logs = '';
      child.stdout.on('data', (chunk) => {
        logs += chunk;
      });
      child.stderr.on('data', (chunk) => {
        logs += chunk;
      });
      try {
        const [code] = await once(child, 'close');
        assert.notEqual(code, 0);
        const report = JSON.parse(
          await readFile(join(output, 'browser.json'), 'utf8'),
        );
        assert.equal(report.status, 'failed');
        assert.notEqual(report.startedAt, 'old-run');
        assert.deepEqual(report.phases, []);
        assert.ok(report.finishedAt);
        assert.match(
          report.error,
          phase === 'server'
            ? /Fixture exited/
            : /Ego upload experiment failed/,
        );
        if (phase === 'browser') {
          assert.match(logs, /controlled browser startup failure/);
          assert.match(
            await readFile(join(output, 'ego.log'), 'utf8'),
            /controlled browser startup failure/,
          );
        }
      } finally {
        if (child.exitCode === null) child.kill();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
}
