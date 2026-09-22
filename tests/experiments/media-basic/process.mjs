import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const childPath = fileURLToPath(
  new URL('./process-child.mjs', import.meta.url),
);
// The experiment shortens execa's 5 s default to leave room within the 5 s
// cancellation budget. This is an experiment setting, not a business policy.
const forceKillAfterDelayMs = 250;
const cancellationBudgetMs = 5_000;
const timeoutMs = 2_000;

async function waitUntilStopped(pid) {
  const started = performance.now();
  while (performance.now() - started < 3_000) {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    if (/^State:\s+T\b/m.test(status)) return;
    await delay(10);
  }
  assert.fail(`Child ${pid} did not enter the Linux stopped state`);
}

async function verifyCase(name) {
  const controller = new AbortController();
  const isTimeout = name === 'timeout';
  const ignoresTerm = name === 'ignore-sigterm' || isTimeout;
  const child = execa(
    process.execPath,
    [childPath, ignoresTerm ? 'ignore-term' : 'normal'],
    {
      ipc: true,
      cancelSignal: controller.signal,
      forceKillAfterDelay: forceKillAfterDelayMs,
      timeout: isTimeout ? timeoutMs : 10_000,
      reject: false,
    },
  );
  // Attach settlement immediately so failures during the readiness handshake
  // remain observable and the finally block can always reap the child.
  const completion = Promise.resolve(child);
  try {
    const ready = await child.getOneMessage();
    assert.deepEqual(ready, { ready: true, pid: child.pid });
    if (name === 'stopped-linux') {
      assert.equal(child.kill('SIGSTOP'), true);
      await waitUntilStopped(child.pid);
    }
    const started = performance.now();
    if (!isTimeout) controller.abort();
    const result = await completion;
    const elapsedMs = Math.round(performance.now() - started);
    const forced = name !== 'sigterm';
    assert.equal(result.failed, true);
    assert.equal(result.signal, forced ? 'SIGKILL' : 'SIGTERM');
    assert.equal(result.isCanceled, !isTimeout);
    assert.equal(result.timedOut, isTimeout);
    assert.equal(result.isForcefullyTerminated, forced);
    if (ignoresTerm) assert.match(result.stderr, /SIGTERM ignored/);
    assert.ok(elapsedMs < cancellationBudgetMs, `${name} took ${elapsedMs} ms`);
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    return {
      name,
      passed: true,
      evidence: {
        pid: child.pid,
        signal: result.signal,
        isCanceled: result.isCanceled,
        timedOut: result.timedOut,
        isForcefullyTerminated: result.isForcefullyTerminated,
        elapsedAfterReadyOrCancelMs: elapsedMs,
        processAbsentAfterReap: true,
        ...(isTimeout ? { timeoutMs } : {}),
      },
    };
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await completion;
  }
}

export async function verifyProcessLifecycle() {
  assert.equal(
    process.versions.node.split('.')[0],
    '24',
    'Use project Node 24',
  );
  const checks = [];
  for (const name of ['sigterm', 'ignore-sigterm', 'timeout']) {
    checks.push(await verifyCase(name));
  }
  const incomplete = [];
  if (process.platform === 'linux') {
    checks.push(await verifyCase('stopped-linux'));
  } else {
    incomplete.push(
      'stopped-linux: requires Linux /proc stopped-state evidence',
    );
  }
  return { forceKillAfterDelayMs, cancellationBudgetMs, checks, incomplete };
}
