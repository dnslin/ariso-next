import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { controlledDirectory, publishExperiment } from './io.ts';

export interface ExperimentOptions {
  sourceRoot: string;
  storageRoot: string;
  targetRoot?: string;
  lowSpaceRoot?: string;
}
const MiB = 1024 * 1024;
async function digest(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function absent(path: string) {
  await assert.rejects(stat(path), { code: 'ENOENT' });
}
async function freeBytes(path: string) {
  const fs = await statfs(path);
  return fs.bavail * fs.bsize;
}

export async function runLocalExperiment(options: ExperimentOptions) {
  assert.equal(
    process.versions.node.split('.')[0],
    '24',
    'Use project Node 24',
  );
  assert.notEqual(
    process.getuid?.(),
    0,
    'Permission experiment must run as non-root',
  );
  const sourceDirectory = await mkdtemp(
    join(options.sourceRoot, 'ariso-source-'),
  );
  const storageDirectory = await mkdtemp(
    join(options.storageRoot, 'ariso-storage-'),
  );
  const report = {
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      release: release(),
      uid: process.getuid?.(),
    },
    checks: [] as { name: string; passed: boolean; evidence: unknown }[],
    incomplete: [] as string[],
  };
  const check = (name: string, evidence: unknown) =>
    report.checks.push({ name, passed: true, evidence });
  const extraDirectories: string[] = [];
  try {
    const source = join(sourceDirectory, 'original');
    await writeFile(source, Buffer.alloc(4 * MiB, 0x5a));
    const originalHash = await digest(source);
    const target = join(storageDirectory, 'target');
    await mkdir(target);
    await mkdir(join(storageDirectory, 'nested'));
    await mkdir(join(storageDirectory, 'ordinary..name'));
    assert.equal(
      await controlledDirectory(storageDirectory, 'ordinary..name'),
      await realpath(join(storageDirectory, 'ordinary..name')),
    );
    await symlink('../target', join(storageDirectory, 'nested', 'inside'));
    await symlink(sourceDirectory, join(storageDirectory, 'outside'));
    for (const valid of ['target', 'nested/../target', 'nested/inside']) {
      assert.equal(
        await controlledDirectory(storageDirectory, valid),
        await realpath(target),
      );
    }
    for (const invalid of ['', '/tmp', '../escape', 'bad\0path', 'outside']) {
      await assert.rejects(controlledDirectory(storageDirectory, invalid));
    }
    // A new leaf is resolved through its existing parent, before creating it.
    const leaf = join(storageDirectory, 'nested/inside/new-leaf');
    assert.equal(
      await controlledDirectory(
        storageDirectory,
        relative(storageDirectory, dirname(leaf)),
      ),
      await realpath(target),
    );
    await assert.rejects(
      controlledDirectory(storageDirectory, 'outside/new-leaf/..'),
    );
    check('paths', {
      root: storageDirectory,
      accepted: ['target', 'nested/../target', 'nested/inside'],
      rejected: ['empty', 'absolute', 'escape', 'NUL', 'outside symlink'],
    });

    async function exercise(directory: string, input: string, name: string) {
      const old = join(directory, 'old.object');
      const other = join(directory, 'other-app.txt');
      await writeFile(old, 'existing reference');
      await writeFile(other, 'unrelated');
      const hash = await digest(input);
      const samples = [];
      for (const phase of [
        undefined,
        'copying',
        'before-publish',
        'published',
      ] as const) {
        const journal = join(
          sourceDirectory,
          `${name}-${phase ?? 'success'}.json`,
        );
        const result = await publishExperiment(
          input,
          directory,
          journal,
          phase,
        );
        const saved = JSON.parse(await readFile(journal, 'utf8'));
        assert.deepEqual(saved, result.paths);
        assert.equal(await digest(input), hash);
        assert.equal(await readFile(old, 'utf8'), 'existing reference');
        assert.equal(await readFile(other, 'utf8'), 'unrelated');
        if (phase === 'copying' || phase === 'before-publish') {
          assert.ok(result.failure instanceof Error);
          const cause = result.failure.cause as Error;
          assert.equal(cause.name, 'AbortError');
          assert.ok(result.bytesWritten > 0);
          if (phase === 'copying')
            assert.ok(result.bytesWritten < (await stat(input)).size);
          await absent(saved.target);
          await unlink(saved.temporary);
        } else {
          assert.equal(result.failure, undefined);
          assert.equal(await digest(saved.target), hash);
          await absent(saved.temporary);
          await unlink(saved.target);
        }
        // Release the experimental reference only after exact-path cleanup.
        await unlink(journal);
        samples.push({
          phase: phase ?? 'success',
          bytesWritten: result.bytesWritten,
          closed: result.closed,
        });
      }
      assert.deepEqual((await readdir(directory)).sort(), [
        'old.object',
        'other-app.txt',
      ]);
      return samples;
    }

    const sameSource = join(storageDirectory, 'same-source');
    await writeFile(sameSource, Buffer.alloc(4 * MiB, 0x5a));
    assert.equal((await stat(sameSource)).dev, (await stat(target)).dev);
    check(
      'same-device',
      await exercise(
        join(storageDirectory, 'nested', 'inside'),
        sameSource,
        'same',
      ),
    );

    const denied = join(storageDirectory, 'denied');
    await mkdir(denied);
    const sentinel = join(denied, 'other-app.txt');
    await writeFile(sentinel, 'keep');
    const journal = join(sourceDirectory, 'permission.json');
    await chmod(denied, 0o500);
    try {
      const result = await publishExperiment(source, denied, journal);
      assert.ok(result.failure instanceof Error);
      assert.equal(
        (result.failure.cause as NodeJS.ErrnoException).code,
        'EACCES',
      );
      assert.ok(result.failure.message.includes(result.paths.temporary));
      assert.deepEqual(
        JSON.parse(await readFile(journal, 'utf8')),
        result.paths,
      );
      assert.equal(await readFile(sentinel, 'utf8'), 'keep');
      await absent(result.paths.target);
      check('permission', {
        error: result.failure.message,
        code: 'EACCES',
        closed: result.closed,
      });
    } finally {
      await chmod(denied, 0o700);
    }

    if (options.targetRoot) {
      const actual = await controlledDirectory(
        options.storageRoot,
        relative(options.storageRoot, options.targetRoot),
      );
      const cross = await mkdtemp(join(actual, 'ariso-cross-'));
      extraDirectories.push(cross);
      const sourceDevice = (await stat(source)).dev;
      const targetDevice = (await stat(cross)).dev;
      assert.notEqual(
        sourceDevice,
        targetDevice,
        'Cross-device evidence requires distinct st_dev',
      );
      const renameTarget = join(cross, 'direct-rename');
      await assert.rejects(rename(source, renameTarget), { code: 'EXDEV' });
      assert.equal(await digest(source), originalHash);
      check('cross-device', {
        sourceDevice,
        targetDevice,
        directRename: 'EXDEV',
        samples: await exercise(cross, source, 'cross'),
      });
    } else report.incomplete.push('cross-device');

    if (options.lowSpaceRoot) {
      const actual = await controlledDirectory(
        options.storageRoot,
        relative(options.storageRoot, options.lowSpaceRoot),
      );
      const low = await mkdtemp(join(actual, 'ariso-low-'));
      extraDirectories.push(low);
      const initialFree = await freeBytes(low);
      // This bounds the destructive experiment, not product admission or reservation.
      assert.ok(
        initialFree >= 8 * MiB && initialFree <= 64 * MiB,
        `Use a dedicated 8–64 MiB volume: ${initialFree}`,
      );
      assert.notEqual((await stat(low)).dev, (await stat(source)).dev);
      const smallSamples = await exercise(low, source, 'low-small');
      const large = join(sourceDirectory, 'larger-than-volume');
      // Bounded source fixture; streaming operation never buffers the whole object.
      await writeFile(large, Buffer.alloc(initialFree + MiB, 0x6b));
      const largeHash = await digest(large);
      const lowJournal = join(sourceDirectory, 'enospc.json');
      const result = await publishExperiment(large, low, lowJournal);
      assert.ok(result.failure instanceof Error);
      assert.equal(
        (result.failure.cause as NodeJS.ErrnoException).code,
        'ENOSPC',
      );
      assert.ok(result.failure.message.includes(result.paths.temporary));
      assert.equal(await digest(large), largeHash);
      assert.deepEqual(
        JSON.parse(await readFile(lowJournal, 'utf8')),
        result.paths,
      );
      await absent(result.paths.target);
      assert.ok((await stat(result.paths.temporary)).size > 0);
      const exhaustedFree = await freeBytes(low);
      // Real cleanup failure must retain both the file and its exact responsibility.
      await chmod(low, 0o500);
      try {
        await assert.rejects(unlink(result.paths.temporary), {
          code: 'EACCES',
        });
        assert.deepEqual(
          JSON.parse(await readFile(lowJournal, 'utf8')),
          result.paths,
        );
        assert.ok((await stat(result.paths.temporary)).size > 0);
      } finally {
        await chmod(low, 0o700);
      }
      await unlink(result.paths.temporary);
      await unlink(lowJournal);
      assert.equal(
        await readFile(join(low, 'old.object'), 'utf8'),
        'existing reference',
      );
      assert.equal(
        await readFile(join(low, 'other-app.txt'), 'utf8'),
        'unrelated',
      );
      assert.deepEqual((await readdir(low)).sort(), [
        'old.object',
        'other-app.txt',
      ]);
      const recoveredFree = await freeBytes(low);
      assert.ok(
        recoveredFree > exhaustedFree,
        'Exact partial cleanup must reclaim space',
      );
      const recoveredSamples = await exercise(low, source, 'low-recovered');
      check('low-space', {
        initialFree,
        exhaustedFree,
        recoveredFree,
        recoveredSamples,
        bytesWritten: result.bytesWritten,
        error: result.failure.message,
        code: 'ENOSPC',
        closed: result.closed,
        smallSamples,
      });
    } else report.incomplete.push('low-space');
    return report;
  } finally {
    // Harness teardown is limited to mkdtemp-owned fixtures, never the supplied roots.
    for (const directory of [
      ...extraDirectories,
      storageDirectory,
      sourceDirectory,
    ]) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
