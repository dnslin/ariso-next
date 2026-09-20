import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, fstatSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    implementation: { type: 'string', default: 'src/server/storage/local.ts' },
    'source-root': { type: 'string' },
    'storage-root': { type: 'string' },
    'target-root': { type: 'string' },
    'low-space-root': { type: 'string' },
    report: { type: 'string' },
    'require-complete': { type: 'boolean', default: false },
  },
});
assert.ok(values['source-root'] && values['storage-root'] && values.report);
assert.equal(process.versions.node.split('.')[0], '24');
assert.notEqual(
  process.getuid?.(),
  0,
  'Run permission verification as non-root',
);
const api = await import(pathToFileURL(resolve(values.implementation)).href);
const MiB = 1024 * 1024;
const report = {
  environment: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    release: release(),
    uid: process.getuid?.(),
    implementation: resolve(values.implementation),
  },
  checks: [],
  incomplete: [],
};
const check = (name, evidence) =>
  report.checks.push({ name, passed: true, evidence });
const owned = [];
async function fixture(root, prefix) {
  const path = await mkdtemp(join(root, prefix));
  owned.push(path);
  return path;
}
async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
async function free(path) {
  const info = await statfs(path);
  return info.bavail * info.bsize;
}
async function closedDescriptors(directory) {
  if (platform() !== 'linux')
    return 'Linux output descriptor inventory unavailable';
  const open = [];
  for (const fd of await readdir('/proc/self/fd')) {
    try {
      const path = await readlink(`/proc/self/fd/${fd}`);
      if (path.startsWith(directory + '/')) open.push({ fd, path });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  assert.deepEqual(open, [], 'No descriptors may remain for fixture objects');
  return 'No fixture descriptors in /proc/self/fd';
}
try {
  const sourceDirectory = await fixture(values['source-root'], 'ariso-source-');
  const root = await realpath(values['storage-root']);
  const directory = await fixture(root, 'ariso-production-');
  const source = join(sourceDirectory, 'source');
  await writeFile(source, Buffer.alloc(4 * MiB, 0x5a));
  const sourceHash = await hash(source);
  await mkdir(join(directory, 'target'));
  await mkdir(join(directory, 'nested'));
  await symlink('../target', join(directory, 'nested', 'inside'));
  await symlink(sourceDirectory, join(directory, 'outside'));
  const pathInput = relative(root, directory);
  assert.equal(
    api.prepareLocalDirectory(root, `${pathInput}/nested/inside/new`),
    join(directory, 'target/new'),
  );
  for (const invalid of [
    '',
    '/tmp',
    '../escape',
    'bad\0path',
    `${pathInput}/outside/new`,
  ])
    assert.throws(() => api.prepareLocalDirectory(root, invalid));
  check('controlled-paths', {
    root,
    insideSymlink: 'nested/inside -> ../target',
    outsideRejected: sourceDirectory,
  });

  async function exercise(target, input, name, expectCode) {
    const storage = {
      id: name,
      localPath: relative(root, target),
      enabled: true,
    };
    await mkdir(join(target, 'ariso', name, 'objects'), { recursive: true });
    const namespace = await realpath(join(target, 'ariso', name));
    const old = join(namespace, 'old.object');
    const unrelated = join(namespace, 'other.partial');
    await writeFile(old, 'existing reference');
    await writeFile(unrelated, 'unrelated');
    const original = await hash(input);
    const samples = [];
    for (const phase of expectCode
      ? ['failure']
      : ['success', 'copying', 'before-publish', 'published']) {
      const plan = api.planLocalWrite('objects');
      const journal = join(sourceDirectory, `${name}-${phase}.json`);
      await writeFile(
        journal,
        JSON.stringify({ storageId: storage.id, ...plan }),
        { flag: 'wx', flush: true },
      );
      const controller = new AbortController();
      const stream = createReadStream(input, { highWaterMark: 64 * 1024 });
      let descriptor;
      stream.once('open', (fd) => {
        descriptor = fd;
      });
      if (phase === 'copying')
        stream.on('data', () => {
          if (stream.bytesRead >= MiB) controller.abort();
        });
      if (phase === 'before-publish')
        stream.once('close', () => controller.abort());
      let result, failure;
      try {
        result = await api.writeObject(
          root,
          storage,
          plan,
          stream,
          controller.signal,
        );
      } catch (error) {
        failure = error;
      }
      if (phase === 'published') controller.abort();
      assert.ok(stream.closed);
      if (descriptor !== undefined)
        assert.throws(() => fstatSync(descriptor), { code: 'EBADF' });
      const handles = await closedDescriptors(namespace);
      assert.deepEqual(JSON.parse(await readFile(journal, 'utf8')), {
        storageId: storage.id,
        ...plan,
      });
      assert.equal(await hash(input), original);
      assert.equal(await readFile(old, 'utf8'), 'existing reference');
      assert.equal(await readFile(unrelated, 'utf8'), 'unrelated');
      let bytes;
      if (failure) {
        assert.ok(
          expectCode || phase === 'copying' || phase === 'before-publish',
          'Successful publication must not fail',
        );
        if (expectCode) assert.equal(failure.cause.code, expectCode);
        else assert.equal(failure.cause.name, 'AbortError');
        assert.ok(failure.message.includes(namespace));
        assert.equal(await api.inspectObject(root, storage, plan.key), null);
        const partial = await api.inspectObject(
          root,
          storage,
          plan.temporaryKey,
        );
        bytes = partial?.size ?? 0;
        if (phase === 'copying' || expectCode === 'ENOSPC')
          assert.ok(bytes > 0 && bytes < (await stat(input)).size);
        if (phase === 'before-publish')
          assert.equal(bytes, (await stat(input)).size);
        if (expectCode === 'ENOSPC') {
          const parent = join(namespace, 'objects');
          await chmod(parent, 0o500);
          try {
            await assert.rejects(
              api.deleteObject(root, storage, plan.temporaryKey),
              (error) => error.cause.code === 'EACCES',
            );
            assert.equal(
              (await api.inspectObject(root, storage, plan.temporaryKey)).size,
              bytes,
            );
            assert.equal(
              JSON.parse(await readFile(journal, 'utf8')).temporaryKey,
              plan.temporaryKey,
            );
          } finally {
            await chmod(parent, 0o700);
          }
        }
        await api.deleteObject(root, storage, plan.temporaryKey);
      } else {
        assert.ok(
          !expectCode && phase !== 'copying' && phase !== 'before-publish',
        );
        assert.equal(result.size, (await stat(input)).size);
        assert.equal(result.key, plan.key);
        const read = await api.readObject(
          root,
          storage,
          plan.key,
          'image/verified',
        );
        assert.equal(read.contentType, 'image/verified');
        assert.equal(read.size, result.size);
        const fd = read.stream.fd;
        const digest = createHash('sha256');
        for await (const chunk of read.stream) digest.update(chunk);
        assert.equal(digest.digest('hex'), original);
        assert.ok(read.stream.closed);
        assert.throws(() => fstatSync(fd), { code: 'EBADF' });
        bytes = result.size;
        assert.equal(
          await api.inspectObject(root, storage, plan.temporaryKey),
          null,
        );
        await api.deleteObject(root, storage, plan.key);
      }
      await api.deleteObject(root, storage, plan.temporaryKey);
      await rm(journal);
      assert.deepEqual(await readdir(join(namespace, 'objects')), []);
      assert.equal(await readFile(old, 'utf8'), 'existing reference');
      assert.equal(await readFile(unrelated, 'utf8'), 'unrelated');
      samples.push({
        phase,
        bytes,
        code: failure?.cause.code,
        sourceClosed: stream.closed,
        handles,
      });
    }
    return samples;
  }
  const sameSource = join(directory, 'same-source');
  await writeFile(sameSource, Buffer.alloc(4 * MiB, 0x5a));
  check(
    'same-device-and-symlink',
    await exercise(join(directory, 'nested/inside'), sameSource, 'same'),
  );
  const denied = join(directory, 'denied');
  await mkdir(denied);
  await chmod(denied, 0o500);
  try {
    const storage = {
      id: 'denied',
      localPath: relative(root, denied),
      enabled: true,
    };
    const plan = api.planLocalWrite('objects');
    const journal = join(sourceDirectory, 'denied.json');
    await writeFile(journal, JSON.stringify(plan), { flush: true });
    const stream = createReadStream(source);
    await assert.rejects(
      api.writeObject(root, storage, plan, stream),
      (error) =>
        error.cause.code === 'EACCES' && error.cause.path.startsWith(denied),
    );
    assert.ok(stream.closed);
    assert.deepEqual(JSON.parse(await readFile(journal, 'utf8')), plan);
    check('permission', {
      code: 'EACCES',
      path: denied,
      sourceClosed: stream.closed,
    });
  } finally {
    await chmod(denied, 0o700);
  }
  if (values['target-root']) {
    const cross = await fixture(
      api.prepareLocalDirectory(
        root,
        relative(root, values['target-root']) || '.',
      ),
      'ariso-cross-',
    );
    const sourceDevice = (await stat(source)).dev,
      targetDevice = (await stat(cross)).dev;
    assert.notEqual(sourceDevice, targetDevice);
    await assert.rejects(rename(source, join(cross, 'rename')), {
      code: 'EXDEV',
    });
    check('cross-device-mounted-storage', {
      sourceDevice,
      targetDevice,
      directRename: 'EXDEV',
      samples: await exercise(cross, source, 'cross'),
    });
  } else report.incomplete.push('cross-device');
  if (values['low-space-root']) {
    const low = await fixture(
      api.prepareLocalDirectory(
        root,
        relative(root, values['low-space-root']) || '.',
      ),
      'ariso-low-',
    );
    const initialFree = await free(low);
    assert.ok(
      initialFree >= 8 * MiB && initialFree <= 64 * MiB,
      'Use dedicated 8–64 MiB volume',
    );
    const smallSamples = await exercise(low, source, 'small');
    const large = join(sourceDirectory, 'large');
    await writeFile(large, Buffer.alloc(initialFree + MiB, 0x6b));
    const failures = await exercise(low, large, 'full', 'ENOSPC');
    const recoveredFree = await free(low);
    assert.ok(
      recoveredFree > initialFree - 2 * MiB,
      'Partial cleanup must reclaim space',
    );
    check('low-space', {
      initialFree,
      recoveredFree,
      smallSamples,
      failures,
      recoveredSamples: await exercise(low, source, 'recovered'),
    });
  } else report.incomplete.push('ENOSPC and cleanup-EACCES on limited volume');
  assert.equal(await hash(source), sourceHash);
  if (platform() !== 'linux')
    report.incomplete.push('Linux output descriptor inventory');
} catch (error) {
  report.failure = {
    message: error.message,
    stack: error.stack,
    cause: error.cause?.message,
  };
  process.exitCode = 1;
} finally {
  for (const directory of owned.reverse())
    await rm(directory, { recursive: true, force: true });
  await mkdir(dirname(values.report), { recursive: true });
  await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (values['require-complete'] && report.incomplete.length)
  throw new Error(`Missing real environments: ${report.incomplete.join(', ')}`);
