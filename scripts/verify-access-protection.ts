import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAccessProtectionBrowser } from './browser-access-protection.mjs';
import { stop } from '../tests/integration/runtime/process-helpers.ts';

export async function runAccessProtectionVerification(options: {
  spaceId: number;
  pageLabel?: string;
  output?: string;
  signal?: AbortSignal;
}) {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
  assert.ok(
    Number.isInteger(options.spaceId) && options.spaceId > 0,
    'An existing Ego TaskSpace is required',
  );
  const output = resolve(
    options.output ?? 'test-results/browser-access-protection',
  );
  await mkdir(output, { recursive: true });
  const secrets: string[] = [];
  const report = {
    status: 'failed',
    startedAt: new Date().toISOString(),
    taskSpaceId: options.spaceId,
    accessProtection: 'pending',
  };
  const controller = new AbortController();
  const interrupt = () =>
    controller.abort(new Error('Access protection verification interrupted'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const redact = (value: string) =>
    secrets.reduce(
      (text, secret) => text.replaceAll(secret, '[redacted]'),
      value,
    );
  try {
    await runAccessProtectionBrowser({
      spaceId: options.spaceId,
      pageLabel: options.pageLabel ?? 'p1',
      output,
      secrets,
      report,
      runBrowser: async (
        script: string,
        config: Record<string, unknown>,
        logName: string,
      ) => {
        signal.throwIfAborted();
        const source = await readFile(new URL(script, import.meta.url), 'utf8');
        const child = spawn('ego-browser', ['nodejs'], {
          detached: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let logs = '';
        child.stdout.on('data', (chunk) => {
          logs += chunk;
        });
        child.stderr.on('data', (chunk) => {
          logs += chunk;
        });
        const closed = once(child, 'close');
        const bounded = once(child, 'close', {
          signal: AbortSignal.any([signal, AbortSignal.timeout(600000)]),
        });
        child.stdin.on('error', () => {
          /* Process exit reports the failure below. */
        });
        child.stdin.end(`const config = ${JSON.stringify(config)};\n${source}`);
        try {
          const [code] = await bounded;
          assert.equal(code, 0, redact(logs));
        } finally {
          await stop(child, closed);
          await writeFile(join(output, logName), redact(logs));
          process.stdout.write(redact(logs));
        }
      },
    });
    report.status = 'passed';
    return report;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    await writeFile(
      join(output, 'access-protection-runner.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await runAccessProtectionVerification({
    spaceId: Number(process.env.EGO_TASK_SPACE),
    pageLabel: process.env.EGO_PAGE_LABEL ?? 'p1',
    output: process.env.BROWSER_REPORT_DIR,
  });
}
