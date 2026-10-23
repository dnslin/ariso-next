import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRestoreRemote } from '../../../src/server/backup/restore-remote.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { remoteEndpoint } from './restore-remote-fixture.ts';

let directory: string;
let endpoint: Awaited<ReturnType<typeof remoteEndpoint>> | undefined;
const encryptionKey = Buffer.alloc(32, 37);
const source = {
  storageId: 'source-storage',
  name: 'Original S3',
  region: 'test',
  forcePathStyle: true,
  endpoint: 'https://old.example.test',
  bucket: 'original',
  pathPrefix: 'old',
  configRevision: 7,
};
const input = {
  endpoint: 'https://new.example.test/',
  region: 'test',
  bucket: 'restored',
  pathPrefix: '/恢复 + %/',
  forcePathStyle: true,
  accessKey: 'remote-fixture-access',
  secretKey: 'remote-fixture-secret',
};
const open = () =>
  createRestoreRemote({
    jobDirectory: directory,
    jobId: 'restore-job',
    encryptionKey,
    sources: [source],
  });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-restore-remote-'));
});
afterEach(async () => {
  await endpoint?.close();
  endpoint = undefined;
  await rm(directory, { recursive: true, force: true });
});

it('saves a revision-bound target with private encrypted credentials and the original storage namespace', async () => {
  const remote = open();
  expect(remote.list()).toEqual([]);
  const saved = remote.saveTarget(source.storageId, input);
  expect(saved).toMatchObject({
    storageId: source.storageId,
    endpoint: 'https://new.example.test',
    pathPrefix: '恢复 + %',
    namespace: '恢复 + %/ariso/source-storage/',
    revision: 8,
    testedRevision: null,
    testStatus: 'untested',
    credentialsConfigured: true,
    cleanupPending: false,
    writeStarted: false,
  });
  const persisted = await readFile(join(directory, 'remote.json'), 'utf8');
  expect(persisted).not.toContain(input.accessKey);
  expect(persisted).not.toContain(input.secretKey);
  expect(JSON.stringify(saved)).not.toContain('Encrypted');
  expect(open().list()).toEqual([saved]);
  const {
    accessKey: _access,
    secretKey: _secret,
    ...withoutCredentials
  } = input;
  void _access;
  void _secret;
  expect(remote.saveTarget(source.storageId, withoutCredentials).revision).toBe(
    9,
  );
});

it('rejects missing credentials and any original namespace before persisting a target', () => {
  const remote = open();
  expect(() =>
    remote.saveTarget(source.storageId, { ...input, accessKey: undefined }),
  ).toThrow();
  expect(() =>
    remote.saveTarget(source.storageId, {
      ...input,
      endpoint: source.endpoint,
      bucket: source.bucket,
      pathPrefix: source.pathPrefix,
    }),
  ).toThrow(/原/);
  expect(remote.list()).toEqual([]);
});

it('rejects overlapping target namespaces and unknown source identities', () => {
  const remote = createRestoreRemote({
    jobDirectory: directory,
    jobId: 'restore-job',
    encryptionKey,
    sources: [
      source,
      { ...source, storageId: 'second-storage', pathPrefix: 'second' },
    ],
  });
  remote.saveTarget(source.storageId, input);
  expect(() =>
    remote.saveTarget('second-storage', {
      ...input,
      pathPrefix: '恢复 + %/ariso/source-storage/nested',
    }),
  ).toThrow(/重叠/);
  expect(() => remote.saveTarget('not-in-backup', input)).toThrow(/存储/);
});

async function configured() {
  endpoint = await remoteEndpoint();
  const remote = open();
  const saved = remote.saveTarget(source.storageId, {
    ...input,
    endpoint: endpoint.endpoint,
  });
  return { remote, saved, prefix: saved.namespace };
}

it('tests the actual SDK connection and removes the probe and owner marker, retaining revision-bound evidence', async () => {
  const { remote, saved } = await configured();
  const result = await remote.testTarget(source.storageId, {
    revision: saved.revision,
  });
  expect(result).toMatchObject({
    testStatus: 'passed',
    testedRevision: 8,
    cleanupPending: false,
  });
  expect(endpoint!.objects.size).toBe(0);
  expect(
    endpoint!.requests.some(
      (request) => request.method === 'PUT' && request.conditional,
    ),
  ).toBe(true);
  const [configuration] = remote.configurations();
  expect(configuration.revision).toBe(8);
  expect(configuration.connectionReport.passed).toBe(true);
  expect(
    createSecretCrypto(encryptionKey).decryptSecret(
      configuration.secretKeyEncrypted,
      'test',
    ),
  ).toBe(input.secretKey);
  const reloaded = createRestoreRemote({
    jobDirectory: directory,
    jobId: 'restore-job',
    encryptionKey,
    sources: [],
  });
  expect(reloaded.list()).toEqual(remote.list());
  expect(reloaded.configurations()).toEqual(remote.configurations());
  expect(() =>
    remote.testTarget(source.storageId, { revision: 7 }),
  ).toThrowError(
    expect.objectContaining({ code: 'RESTORE_TARGET_TEST_STALE' }),
  );
});

it('refuses a preexisting namespace without writing or deleting any of its objects', async () => {
  const { remote, saved, prefix } = await configured();
  endpoint!.objects.set(`${prefix}images/foreign`, Buffer.from('retain'));
  const result = await remote.testTarget(source.storageId, {
    revision: saved.revision,
  });
  expect(result.testStatus).toBe('failed');
  expect(result.failure?.code).toBe('RESTORE_TARGET_NOT_EMPTY');
  expect(result.cleanupPending).toBe(false);
  expect(
    endpoint!.requests.filter(({ method }) =>
      ['PUT', 'DELETE'].includes(method),
    ),
  ).toEqual([]);
  expect(endpoint!.objects.get(`${prefix}images/foreign`)!.toString()).toBe(
    'retain',
  );
});

it('rejects an endpoint which ignores conditional owner writes and cleans only its own marker', async () => {
  const { remote, saved } = await configured();
  endpoint!.control.ignoreConditional = true;
  const result = await remote.testTarget(source.storageId, {
    revision: saved.revision,
  });
  expect(result).toMatchObject({
    testStatus: 'failed',
    cleanupPending: false,
    failure: { code: 'RESTORE_CONDITIONAL_WRITE_UNSUPPORTED' },
  });
  expect(endpoint!.objects.size).toBe(0);
});

it('allows only one task to own a concurrently tested empty namespace', async () => {
  const { remote, saved, prefix } = await configured();
  const other = createRestoreRemote({
    jobDirectory: join(directory, 'other'),
    jobId: 'other-job',
    encryptionKey,
    sources: [source],
  });
  other.saveTarget(source.storageId, {
    ...input,
    endpoint: endpoint!.endpoint,
  });
  const held = Promise.withResolvers<void>();
  endpoint!.control.holdWrite = (key) =>
    key.includes('/restore/probes/') ? held.promise : Promise.resolve();
  const first = remote.testTarget(source.storageId, {
    revision: saved.revision,
  });
  try {
    await vi.waitFor(() =>
      expect(
        [...endpoint!.objects.keys()].some((key) =>
          key.includes('/restore/probes/'),
        ),
      ).toBe(true),
    );
    const second = await other.testTarget(source.storageId, {
      revision: saved.revision,
    });
    expect(second).toMatchObject({
      testStatus: 'failed',
      cleanupPending: false,
    });
    expect(
      JSON.parse(
        endpoint!.objects.get(`${prefix}restore/owner.json`)!.toString(),
      ).jobId,
    ).toBe('restore-job');
  } finally {
    held.resolve();
  }
  expect((await first).testStatus).toBe('passed');
});

it('records a deterministic plan before writes, retries its keys, and never rereads successful image uploads', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entries = ['images/one', 'images/two'].map((key) => ({
    storageId: source.storageId,
    key,
    size: 3,
    contentType: 'image/png',
  }));
  await remote.beginRestore(entries);
  await remote.writeObject(entries[0], Readable.from([Buffer.from('one')]));
  endpoint!.control.failWrite = 'images/two';
  endpoint!.control.writeFailureStatus = 403;
  await expect(
    remote.writeObject(entries[1], Readable.from([Buffer.from('two')])),
  ).rejects.toThrow();
  endpoint!.control.failWrite = '';
  const retry = createRestoreRemote({
    jobDirectory: directory,
    jobId: 'restore-job',
    encryptionKey,
    sources: [],
  });
  await retry.beginRestore(entries);
  for (const entry of entries)
    await retry.writeObject(
      entry,
      Readable.from([Buffer.from(entry.key.endsWith('one') ? 'one' : 'two')]),
    );
  await retry.finishRestore();
  expect([...endpoint!.objects.keys()].sort()).toEqual(
    entries.map(({ key }) => prefix + key),
  );
  expect(
    endpoint!.requests.filter(
      ({ method, key }) => method === 'GET' && key.includes('/images/'),
    ),
  ).toEqual([]);
  expect(retry.list()[0]).toMatchObject({
    writeStarted: true,
    cleanupPending: false,
  });
  expect(() =>
    retry.saveTarget(source.storageId, {
      ...input,
      endpoint: endpoint!.endpoint,
    }),
  ).toThrow(/复制/);
});

it('keeps failed cleanup and target credentials retryable, without touching another prefix', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entry = { storageId: source.storageId, key: 'images/one', size: 3 };
  await remote.beginRestore([entry]);
  await remote.writeObject(entry, Readable.from([Buffer.from('one')]));
  endpoint!.objects.set(
    'unrelated/ariso/other/images/one',
    Buffer.from('keep'),
  );
  endpoint!.control.failDelete = true;
  await expect(remote.cleanup()).rejects.toMatchObject({
    code: 'RESTORE_REMOTE_CLEANUP_FAILED',
  });
  expect(remote.list()[0].cleanupPending).toBe(true);
  expect(() =>
    remote.saveTarget(source.storageId, {
      ...input,
      endpoint: endpoint!.endpoint,
      pathPrefix: 'other',
    }),
  ).toThrow(/清理/);
  remote.saveTarget(source.storageId, {
    ...input,
    endpoint: endpoint!.endpoint,
    secretKey: 'corrected-fixture-secret',
  });
  endpoint!.control.failDelete = false;
  await remote.cleanup();
  expect(endpoint!.objects.has(`${prefix}images/one`)).toBe(false);
  expect(
    endpoint!.objects.get('unrelated/ariso/other/images/one')!.toString(),
  ).toBe('keep');
  expect(remote.list()[0].cleanupPending).toBe(false);
  expect(
    (await readFile(join(directory, 'remote.json'), 'utf8')).includes(
      'corrected-fixture-secret',
    ),
  ).toBe(false);
});

it('refuses unknown keys during retry and cleanup instead of widening deletion', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entry = { storageId: source.storageId, key: 'images/own', size: 3 };
  await remote.beginRestore([entry]);
  await remote.writeObject(entry, Readable.from([Buffer.from('own')]));
  endpoint!.objects.set(`${prefix}images/foreign`, Buffer.from('keep'));
  await expect(remote.beginRestore([entry])).rejects.toMatchObject({
    code: 'RESTORE_REMOTE_UNKNOWN_OBJECT',
  });
  await expect(remote.cleanup()).rejects.toThrow();
  expect(endpoint!.objects.has(`${prefix}images/own`)).toBe(true);
  expect(endpoint!.objects.get(`${prefix}images/foreign`)!.toString()).toBe(
    'keep',
  );
});

it('requires an empty namespace again when the connection test has ended but copying has not started', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entry = { storageId: source.storageId, key: 'images/planned', size: 3 };
  endpoint!.objects.set(`${prefix}${entry.key}`, Buffer.from('old'));
  await expect(remote.beginRestore([entry])).rejects.toMatchObject({
    code: 'RESTORE_TARGET_NOT_EMPTY',
  });
  expect(endpoint!.objects.get(`${prefix}${entry.key}`)!.toString()).toBe(
    'old',
  );
});

it.each(['missing', 'wrong-size'])(
  'does not finalize when the final remote listing is %s',
  async (mode) => {
    const { remote, saved, prefix } = await configured();
    await remote.testTarget(source.storageId, { revision: saved.revision });
    const entry = {
      storageId: source.storageId,
      key: 'images/planned',
      size: 3,
    };
    await remote.beginRestore([entry]);
    await remote.writeObject(entry, Readable.from([Buffer.from('new')]));
    if (mode === 'missing') endpoint!.objects.delete(`${prefix}${entry.key}`);
    else
      endpoint!.objects.set(
        `${prefix}${entry.key}`,
        Buffer.from('changed-size'),
      );
    await expect(remote.finishRestore()).rejects.toMatchObject({
      code: 'RESTORE_REMOTE_INCOMPLETE',
    });
    expect(endpoint!.objects.has(`${prefix}restore/owner.json`)).toBe(true);
    expect(remote.list()[0].cleanupPending).toBe(true);
  },
);

it('recovers only explicitly at startup and publishes testing before asynchronous residual cleanup', async () => {
  const { remote, saved, prefix } = await configured();
  const record = JSON.parse(
    await readFile(join(directory, 'remote.json'), 'utf8'),
  );
  Object.assign(record.targets[0], {
    testStatus: 'testing',
    cleanupPending: true,
    claim: 'owned',
    probeKey: 'restore/probes/interrupted',
  });
  await writeFile(join(directory, 'remote.json'), JSON.stringify(record));
  endpoint!.objects.set(
    `${prefix}restore/owner.json`,
    Buffer.from(
      JSON.stringify({ jobId: 'restore-job', storageId: source.storageId }),
    ),
  );
  endpoint!.objects.set(
    `${prefix}restore/probes/interrupted`,
    Buffer.from('old probe'),
  );
  const reload = createRestoreRemote({
    jobDirectory: directory,
    jobId: 'restore-job',
    encryptionKey,
    sources: [],
  });
  expect(reload.list()[0].testStatus).toBe('testing');
  reload.recoverTests();
  expect(reload.list()[0]).toMatchObject({
    testStatus: 'failed',
    cleanupPending: true,
    failure: { code: 'RESTORE_TARGET_TEST_INTERRUPTED' },
  });
  expect(() =>
    reload.testTarget(source.storageId, { revision: saved.revision - 1 }),
  ).toThrow(/版本/);
  const testing = reload.testTarget(source.storageId, {
    revision: saved.revision,
  });
  expect(remote.list()[0].testStatus).toBe('testing');
  expect((await testing).testStatus).toBe('passed');
  expect(endpoint!.objects.size).toBe(0);
});

it('keeps an aborted PUT registered until explicit cleanup after the request settles', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entry = { storageId: source.storageId, key: 'images/aborted', size: 3 };
  await remote.beginRestore([entry]);
  const held = Promise.withResolvers<void>();
  endpoint!.control.holdWrite = (key) =>
    key.endsWith(entry.key) ? held.promise : Promise.resolve();
  const cancellation = new AbortController();
  const pending = remote.writeObject(
    entry,
    Readable.from([Buffer.from('new')]),
    cancellation.signal,
  );
  const outcome = pending.then(
    () => null,
    (error: unknown) => error,
  );
  try {
    await vi.waitFor(() =>
      expect(endpoint!.objects.has(`${prefix}${entry.key}`)).toBe(true),
    );
    cancellation.abort(new Error('fixture cancellation'));
    expect(await outcome).toBeInstanceOf(Error);
    expect(remote.list()[0].cleanupPending).toBe(true);
  } finally {
    held.resolve();
  }
  await remote.cleanup();
  expect(endpoint!.objects.size).toBe(0);
});

it('settles testing when a new deployment key cannot decrypt an unfinished target configuration', async () => {
  const { saved } = await configured();
  const changedKey = createRestoreRemote({
    jobDirectory: directory,
    jobId: 'restore-job',
    encryptionKey: Buffer.alloc(32, 38),
    sources: [],
  });
  const testing = changedKey.testTarget(source.storageId, {
    revision: saved.revision,
  });
  await expect(testing).rejects.toThrow(/密文认证失败/);
  expect(changedKey.list()[0]).toMatchObject({
    testStatus: 'failed',
    testedRevision: null,
  });
  expect(endpoint!.requests).toEqual([]);
});

it.each(['data', 'probe', 'owner'] as const)(
  'retains %s PUT responsibility while a fully received request has not committed',
  async (kind) => {
    const { remote, saved, prefix } = await configured();
    const entry = { storageId: source.storageId, key: 'images/late', size: 3 };
    if (kind === 'data') {
      await remote.testTarget(source.storageId, { revision: saved.revision });
      await remote.beginRestore([entry]);
    }
    const entered = Promise.withResolvers<string>();
    const release = Promise.withResolvers<void>();
    endpoint!.control.beforeCommit = (key) => {
      if (
        (kind === 'data' && key.endsWith(entry.key)) ||
        (kind === 'probe' && key.includes('/restore/probes/')) ||
        (kind === 'owner' && key.endsWith('/restore/owner.json'))
      ) {
        entered.resolve(key);
        return release.promise;
      }
      return Promise.resolve();
    };
    const controller = new AbortController();
    const operation =
      kind === 'data'
        ? remote.writeObject(
            entry,
            Readable.from([Buffer.from('new')]),
            controller.signal,
          )
        : remote.testTarget(
            source.storageId,
            { revision: saved.revision },
            controller.signal,
          );
    const outcome = operation.then(
      () => undefined,
      (error: unknown) => error,
    );
    let lateKey: string;
    try {
      lateKey = await entered.promise;
      controller.abort(new Error('request aborted after body receipt'));
      await outcome;
      await expect(remote.cleanup()).rejects.toMatchObject({
        code: 'RESTORE_REMOTE_WRITE_UNCERTAIN',
      });
      expect(remote.list()[0].cleanupPending).toBe(true);
      const record = JSON.parse(
        await readFile(join(directory, 'remote.json'), 'utf8'),
      );
      expect(record.targets[0].pendingKey).toBe(lateKey.slice(prefix.length));
      expect(endpoint!.objects.has(lateKey)).toBe(false);
    } finally {
      release.resolve();
      await outcome;
    }
    await vi.waitFor(() => expect(endpoint!.objects.has(lateKey!)).toBe(true));
    await remote.cleanup();
    expect(remote.list()[0].cleanupPending).toBe(false);
    expect(endpoint!.objects.size).toBe(0);
  },
);

it('does not confuse an old owner with an unresolved conditional owner PUT', async () => {
  const { remote, saved, prefix } = await configured();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let ownerPuts = 0;
  endpoint!.control.beforeCommit = (key) => {
    if (key.endsWith('/restore/owner.json') && ++ownerPuts === 2) {
      entered.resolve();
      return release.promise;
    }
    return Promise.resolve();
  };
  const controller = new AbortController();
  const testing = remote.testTarget(
    source.storageId,
    { revision: saved.revision },
    controller.signal,
  );
  const outcome = testing.then(
    () => undefined,
    (error: unknown) => error,
  );
  try {
    await entered.promise;
    controller.abort(new Error('conditional response was lost'));
    await outcome;
    await expect(remote.cleanup()).rejects.toMatchObject({
      code: 'RESTORE_REMOTE_WRITE_UNCERTAIN',
    });
    expect(endpoint!.objects.has(`${prefix}restore/owner.json`)).toBe(true);
  } finally {
    release.resolve();
    await outcome;
  }
  expect(remote.list()[0].cleanupPending).toBe(true);
});

it('removes the previous confirmed payload before retrying so an old object cannot settle a new uncommitted PUT', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entries = ['images/one', 'images/two'].map((key) => ({
    storageId: source.storageId,
    key,
    size: 3,
  }));
  await remote.beginRestore(entries);
  await remote.writeObject(entries[0], Readable.from([Buffer.from('old')]));
  endpoint!.control.failWrite = 'images/two';
  endpoint!.control.writeFailureStatus = 403;
  await expect(
    remote.writeObject(entries[1], Readable.from([Buffer.from('two')])),
  ).rejects.toThrow();
  endpoint!.control.failWrite = '';
  const ownerDeletes = endpoint!.requests.filter(
    (request) =>
      request.method === 'DELETE' &&
      request.key.endsWith('/restore/owner.json'),
  ).length;
  await remote.beginRestore(entries);
  expect(
    endpoint!.requests.filter(
      (request) =>
        request.method === 'DELETE' &&
        request.key.endsWith('/restore/owner.json'),
    ),
  ).toHaveLength(ownerDeletes);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  endpoint!.control.beforeCommit = (key) => {
    if (key.endsWith('images/one')) {
      entered.resolve();
      return release.promise;
    }
    return Promise.resolve();
  };
  const controller = new AbortController();
  const operation = remote.writeObject(
    entries[0],
    Readable.from([Buffer.from('new')]),
    controller.signal,
  );
  const outcome = operation.then(
    () => undefined,
    (error: unknown) => error,
  );
  try {
    await entered.promise;
    expect(endpoint!.objects.has(`${prefix}images/one`)).toBe(false);
    controller.abort(new Error('retry body received without commit'));
    await outcome;
    await expect(remote.cleanup()).rejects.toMatchObject({
      code: 'RESTORE_REMOTE_WRITE_UNCERTAIN',
    });
  } finally {
    controller.abort();
    release.resolve();
    await outcome;
  }
  await vi.waitFor(() =>
    expect(endpoint!.objects.has(`${prefix}images/one`)).toBe(true),
  );
  await remote.beginRestore(entries);
  for (const entry of entries)
    await remote.writeObject(entry, Readable.from([Buffer.from('new')]));
  await remote.finishRestore();
  const record = JSON.parse(
    await readFile(join(directory, 'remote.json'), 'utf8'),
  );
  expect(record.targets[0].pendingKey).toBeUndefined();
  expect(remote.list()[0].cleanupPending).toBe(false);
});

it('settles a fully transmitted explicit 403 refusal so corrected credentials can be tested', async () => {
  const { remote, saved } = await configured();
  endpoint!.control.failWrite = 'restore/owner.json';
  endpoint!.control.writeFailureStatus = 403;
  const failed = await remote.testTarget(source.storageId, {
    revision: saved.revision,
  });
  expect(failed).toMatchObject({ testStatus: 'failed', cleanupPending: false });
  expect(
    endpoint!.requests.find((request) => request.method === 'PUT')!.bytes,
  ).toBeGreaterThan(0);
  const repaired = remote.saveTarget(source.storageId, {
    ...input,
    endpoint: endpoint!.endpoint,
    secretKey: 'repaired-denied-key',
  });
  endpoint!.control.failWrite = '';
  expect(
    (await remote.testTarget(source.storageId, { revision: repaired.revision }))
      .testStatus,
  ).toBe('passed');
});

it('settles an interrupted stream which supplied fewer bytes than the declared S3 length', async () => {
  const { remote, saved } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entry = { storageId: source.storageId, key: 'images/short', size: 3 };
  await remote.beginRestore([entry]);
  const stream = Readable.from(
    (async function* () {
      yield Buffer.from('n');
      throw new Error('source ended before declared length');
    })(),
  );
  await expect(remote.writeObject(entry, stream)).rejects.toThrow();
  await remote.cleanup();
  expect(remote.list()[0].cleanupPending).toBe(false);
});

it('remembers an observed late PUT commit when deletion succeeds but its reply is lost', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entry = {
    storageId: source.storageId,
    key: 'images/delete-reply-lost',
    size: 3,
  };
  await remote.beginRestore([entry]);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  endpoint!.control.beforeCommit = (key) => {
    if (key.endsWith(entry.key)) {
      entered.resolve();
      return release.promise;
    }
    return Promise.resolve();
  };
  const controller = new AbortController();
  const operation = remote.writeObject(
    entry,
    Readable.from([Buffer.from('new')]),
    controller.signal,
  );
  const outcome = operation.then(
    () => undefined,
    (error: unknown) => error,
  );
  try {
    await entered.promise;
    controller.abort(new Error('complete PUT response was not received'));
    expect(await outcome).toBeInstanceOf(Error);
  } finally {
    release.resolve();
    await outcome;
  }
  const key = `${prefix}${entry.key}`;
  await vi.waitFor(() => expect(endpoint!.objects.has(key)).toBe(true));
  endpoint!.control.dropDeleteResponse = entry.key;
  await expect(remote.cleanup()).rejects.toMatchObject({
    code: 'RESTORE_REMOTE_CLEANUP_FAILED',
  });
  expect(endpoint!.objects.has(key)).toBe(false);
  expect(remote.list()[0].cleanupPending).toBe(true);
  const pending = JSON.parse(
    await readFile(join(directory, 'remote.json'), 'utf8'),
  );
  expect(pending.targets[0]).toMatchObject({
    pendingOperation: 'delete',
    pendingKey: entry.key,
  });
  endpoint!.control.dropDeleteResponse = '';
  // A fresh coordinator has only the persisted observation, not the lost reply.
  const reloaded = open();
  await expect(reloaded.cleanup()).resolves.toEqual([
    expect.objectContaining({ cleanupPending: false }),
  ]);
  expect(endpoint!.objects.size).toBe(0);
});

it('does not send a second DELETE while an earlier deletion may still execute', async () => {
  const { remote, saved, prefix } = await configured();
  await remote.testTarget(source.storageId, { revision: saved.revision });
  const entry = {
    storageId: source.storageId,
    key: 'images/delete-pending',
    size: 3,
  };
  await remote.beginRestore([entry]);
  await remote.writeObject(entry, Readable.from([Buffer.from('new')]));
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let deleteCalls = 0;
  endpoint!.control.beforeDelete = (key) => {
    if (key.endsWith(entry.key) && ++deleteCalls === 1) {
      entered.resolve();
      return release.promise;
    }
    return Promise.resolve();
  };
  const controller = new AbortController();
  const cleanup = remote.cleanup(controller.signal);
  const outcome = cleanup.then(
    () => undefined,
    (error: unknown) => error,
  );
  const key = `${prefix}${entry.key}`;
  try {
    await entered.promise;
    controller.abort(new Error('DELETE response not received'));
    expect(await outcome).toBeInstanceOf(Error);
    expect(endpoint!.objects.has(key)).toBe(true);
    const reloaded = open();
    await expect(reloaded.cleanup()).rejects.toMatchObject({
      code: 'RESTORE_REMOTE_WRITE_UNCERTAIN',
    });
    expect(
      endpoint!.requests.filter(
        (request) => request.method === 'DELETE' && request.key === key,
      ),
    ).toHaveLength(1);
    expect(reloaded.list()[0].cleanupPending).toBe(true);
    const record = JSON.parse(
      await readFile(join(directory, 'remote.json'), 'utf8'),
    );
    expect(record.targets[0]).toMatchObject({
      pendingOperation: 'delete',
      pendingKey: entry.key,
    });
  } finally {
    release.resolve();
    await outcome;
  }
  await vi.waitFor(() => expect(endpoint!.objects.has(key)).toBe(false));
  await open().cleanup();
  expect(endpoint!.objects.size).toBe(0);
  const settled = JSON.parse(
    await readFile(join(directory, 'remote.json'), 'utf8'),
  );
  expect(settled.targets[0].pendingOperation).toBeUndefined();
  expect(settled.targets[0].pendingKey).toBeUndefined();
});
