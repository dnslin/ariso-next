import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  checkpointNames,
  paths,
  readState,
  resetModelPassword,
} from './model.mjs';
import { checkLive, createFixture, readTrace, runChild } from './fixture.mjs';
import { initializeRuntimePaths } from '../../../../src/server/runtime/paths.ts';

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'ariso-activation-experiment-'));
const results = [];
const started = performance.now();

async function test(name, run) {
  const start = performance.now();
  try {
    const detail = await run();
    results.push({
      name,
      passed: true,
      durationMs: Math.round(performance.now() - start),
      ...detail,
    });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      durationMs: Math.round(performance.now() - start),
      error: error.stack,
    });
    process.stdout.write(`FAIL ${name}: ${error.message}\n`);
  }
}

function assertDurabilityOrder(trace) {
  const last = (predicate) => trace.findLastIndex(predicate);
  const firstReady = trace.findIndex(
    (e) => e.event === 'state-renamed' && e.phase === 'ready',
  );
  assert(firstReady >= 0);
  assert(
    trace.slice(0, firstReady).filter((e) => e.event === 'prepared-file-synced')
      .length === 4,
  );
  const completed = last(
    (e) => e.event === 'state-renamed' && e.phase === 'completed',
  );
  const dbDirectory = last(
    (e) =>
      e.event === 'directory-synced' && e.label === 'published-database-parent',
  );
  assert(dbDirectory < completed && dbDirectory >= 0);
  for (const name of ['storage', 'assets']) {
    const publication = trace.findIndex(
      (e) => e.event === 'directory-published' && e.name === name,
    );
    const sync = trace.findIndex(
      (e, index) =>
        index > publication &&
        e.event === 'directory-synced' &&
        e.label === `${name}-published-parent`,
    );
    assert(
      publication >= 0 && sync > publication && sync < completed,
      `${name} synced before completed`,
    );
  }
  const completedDirectory = last(
    (e) =>
      e.event === 'directory-synced' && e.label === 'completed-state-parent',
  );
  const normal = last((e) => e.event === 'normal-paths-created');
  assert(completedDirectory < normal && completedDirectory > completed);
  for (let i = 0; i < trace.length; i++) {
    if (trace[i].event === 'background-started')
      assert(
        trace
          .slice(0, i)
          .some((e) => e.event === 'state-renamed' && e.phase === 'completed'),
      );
  }
}

try {
  for (const point of checkpointNames) {
    await test(`SIGKILL:${point}`, async () => {
      const root = join(temporary, point.replaceAll('.', '-'));
      const fixture = await createFixture(root);
      const interrupted = await runChild('activate', root, point);
      assert.equal(interrupted.signal, 'SIGKILL', interrupted.output);
      assert(interrupted.matched, `checkpoint not reached: ${point}`);
      if (!point.startsWith('normal.') && point !== 'background.started')
        assert(
          !existsSync(paths(root).background),
          'Background must not start early',
        );
      const replay = await runChild('activate', root);
      assert.equal(replay.code, 0, replay.output);
      assert.equal(readState(root).phase, 'completed');
      checkLive(root, fixture);
      const trace = readTrace(root);
      assertDurabilityOrder(trace);
      const firstActivating = trace.findIndex(
        (e) => e.event === 'state-renamed' && e.phase === 'activating',
      );
      assert(
        !trace
          .slice(firstActivating + 1)
          .some((e) => e.event === 'blank-check'),
        'Replay must not repeat blank check',
      );
      return {
        actualSignal: interrupted.signal,
        traceEvents: trace.length,
        replayPassed: true,
      };
    });
  }

  await test('missing initial storage/assets is valid', async () => {
    const root = join(temporary, 'missing-initial-directories');
    const fixture = await createFixture(root, {
      missingInitialDirectories: true,
    });
    const first = await runChild('activate', root, 'storage.published');
    assert.equal(first.signal, 'SIGKILL');
    const replay = await runChild('activate', root);
    assert.equal(replay.code, 0, replay.output);
    checkLive(root, fixture);
    assert(!existsSync(join(paths(root).previous, 'storage')));
    assert(!existsSync(join(paths(root).previous, 'assets')));
    assertDurabilityOrder(readTrace(root));
  });

  await test('completed preserves subsequent rows and CLI password', async () => {
    const root = join(temporary, 'completed-preserves-new-data');
    const fixture = await createFixture(root);
    const first = await runChild('activate', root);
    assert.equal(first.code, 0, first.output);
    const db = new Database(paths(root).database);
    db.prepare('INSERT INTO images VALUES (?, ?, ?)').run(
      'after-recovery',
      'post-backup.bin',
      'restored-owner',
    );
    db.close();
    await resetModelPassword(root, 'new-password-hash');
    const before = readTrace(root).filter(
      (e) => e.event === 'database-published',
    ).length;
    const restart = await runChild('activate', root);
    assert.equal(restart.code, 0, restart.output);
    checkLive(root, fixture, 2);
    assert.equal(
      readTrace(root).filter((e) => e.event === 'database-published').length,
      before,
    );
    const verify = new Database(paths(root).database);
    assert.equal(
      verify.prepare('SELECT password FROM owner').get().password,
      'new-password-hash',
    );
    verify.close();
  });

  await test('CLI cannot modify an activating published database', async () => {
    const root = join(temporary, 'cli-blocked-during-activation');
    await createFixture(root);
    const paused = await runChild(
      'activate',
      root,
      'database.directory-synced',
    );
    assert.equal(paused.signal, 'SIGKILL');
    await assert.rejects(
      resetModelPassword(root, 'forbidden-password'),
      /RESTORE_ACTIVATING/,
    );
    const replay = await runChild('activate', root);
    assert.equal(replay.code, 0, replay.output);
    const db = new Database(paths(root).database);
    assert.equal(
      db.prepare('SELECT password FROM owner').get().password,
      'backup-password-hash',
    );
    db.close();
  });

  await test('CLI remains available when no restore task exists', async () => {
    const root = join(temporary, 'cli-no-restore-task');
    await mkdir(root);
    const db = new Database(join(root, 'ariso.db'));
    db.exec(
      "CREATE TABLE owner (id TEXT PRIMARY KEY, password TEXT NOT NULL); INSERT INTO owner VALUES ('normal-owner', 'old-password');",
    );
    db.close();
    await resetModelPassword(root, 'updated-without-restore');
    const verify = new Database(join(root, 'ariso.db'));
    assert.equal(
      verify.prepare('SELECT password FROM owner').get().password,
      'updated-without-restore',
    );
    verify.close();
  });

  await test('CLI rechecks after initial authorization race', async () => {
    const root = join(temporary, 'cli-activation-race');
    await createFixture(root);
    await assert.rejects(
      resetModelPassword(root, 'forbidden-password', async () => {
        const paused = await runChild(
          'activate',
          root,
          'database.directory-synced',
        );
        assert.equal(paused.signal, 'SIGKILL');
      }),
      /RESTORE_ACTIVATING/,
    );
    const replay = await runChild('activate', root);
    assert.equal(replay.code, 0, replay.output);
  });

  await test('initial nonempty target is rejected before publication', async () => {
    const root = join(temporary, 'nonempty-target');
    await createFixture(root);
    const existing = join(root, 'assets', 'user-owned.bin');
    await writeFile(existing, 'preserve me');
    const attempt = await runChild('activate', root);
    assert.equal(attempt.code, 1);
    assert.match(attempt.output, /RESTORE_TARGET_NOT_EMPTY/);
    assert.equal(readFileSync(existing, 'utf8'), 'preserve me');
    assert.equal(readState(root).phase, 'ready');
    assert(!existsSync(paths(root).background));
  });

  await test('post-move directory conflict does not overwrite unknown files', async () => {
    const root = join(temporary, 'directory-conflict');
    await createFixture(root);
    const paused = await runChild(
      'activate',
      root,
      'assets.old-directory-synced',
    );
    assert.equal(paused.signal, 'SIGKILL');
    await mkdir(join(root, 'assets'));
    const unknown = join(root, 'assets', 'unknown.bin');
    await writeFile(unknown, 'preserve conflict');
    const replay = await runChild('activate', root);
    assert.equal(replay.code, 1);
    assert.match(replay.output, /DIRECTORY_CONFLICT: assets/);
    assert.equal(readFileSync(unknown, 'utf8'), 'preserve conflict');
    assert(!existsSync(paths(root).background));
  });

  await test('negative control: retained real old WAL is rejected by data oracle', async () => {
    const root = join(temporary, 'negative-retained-wal');
    await createFixture(root);
    const original = new Database(paths(root).database, { readonly: true });
    assert.equal(
      original.prepare('SELECT COUNT(*) AS n FROM old_marker').get().n,
      2,
    );
    original.close();
    assert(existsSync(paths(root).database + '-wal'));
    copyFileSync(join(paths(root).ready, 'ariso.db'), paths(root).database);
    let observed;
    let db;
    let restoredCorrectly = false;
    try {
      db = new Database(paths(root).database, { readonly: true });
      const integrity = db.pragma('integrity_check', { simple: true });
      const owner = db.prepare('SELECT id FROM owner').get()?.id;
      const images = db.prepare('SELECT COUNT(*) AS n FROM images').get().n;
      restoredCorrectly =
        integrity === 'ok' && owner === 'restored-owner' && images === 1;
      observed = { integrity, owner, images };
    } catch (error) {
      observed = { error: error.message, code: error.code };
    } finally {
      db?.close();
    }
    assert.equal(
      restoredCorrectly,
      false,
      'Retaining old WAL must violate restored-data invariant',
    );
    return { observed };
  });

  await test('negative control: production path initialization breaks in-flight rename', async () => {
    const root = join(temporary, 'negative-early-directory-initialization');
    await createFixture(root);
    const paused = await runChild(
      'activate',
      root,
      'assets.old-directory-synced',
    );
    assert.equal(paused.signal, 'SIGKILL');
    initializeRuntimePaths(root);
    assert(existsSync(join(root, 'assets', 'branding')));
    const replay = await runChild('activate', root);
    assert.equal(replay.code, 1);
    assert.match(replay.output, /DIRECTORY_CONFLICT: assets/);
    assert(!existsSync(paths(root).background));
    return { detected: 'DIRECTORY_CONFLICT: assets' };
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}

const report = {
  scope: 'Isolated activation model; not integrated production startup',
  node: process.version,
  platform: process.platform,
  physicalPowerLossTested: false,
  actualSigkillCheckpoints: checkpointNames.length,
  passed: results.filter((r) => r.passed).length,
  failed: results.filter((r) => !r.passed).length,
  elapsedMs: Math.round(performance.now() - started),
  temporaryResourcesRemoved: !existsSync(temporary),
  results,
};
writeFileSync(
  join(outputDirectory, 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    passed: report.passed,
    failed: report.failed,
    elapsedMs: report.elapsedMs,
    temporaryResourcesRemoved: report.temporaryResourcesRemoved,
  }) + '\n',
);
if (report.failed) process.exitCode = 1;
