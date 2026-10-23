import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { createSecretCrypto } from '../runtime/crypto.ts';
import { createS3Storage } from '../storage/s3.ts';
import { stageError } from '../storage/probes.ts';
import {
  createConnectionReport,
  runConnectionTest,
} from '../storage/connection-test.ts';
import type { ConnectionReport } from '../storage/probe-types.ts';
import { storageCreateInputSchema } from '../storage/validation.ts';
import { BackupError } from './errors.ts';
import type {
  RestoreRemoteSource,
  RestoreRemoteTarget,
  RestoreRemoteTargetInput,
  RestoreRemoteTestInput,
  RestoredRemoteConfiguration,
} from './restore-remote-types.ts';

// These paths refer to DATA_DIR, never to files in Next's build graph.
const { join } = process.getBuiltinModule('node:path');
const ownerKey = 'restore/owner.json';
const targetSchema = storageCreateInputSchema.options[1].omit({
  type: true,
  name: true,
  enabled: true,
});
type StoredTarget = Omit<
  RestoreRemoteTarget,
  'namespace' | 'credentialsConfigured'
> & {
  accessKeyEncrypted: string;
  secretKeyEncrypted: string;
  claim: 'none' | 'claiming' | 'owned' | 'released';
  probeKey?: string;
  connectionReport?: ConnectionReport;
  cleared?: boolean;
  pending?:
    | { operation: 'put'; key: string; startedEmpty: boolean }
    | { operation: 'delete'; key: string };
};
type RemoteState = {
  jobId: string;
  sources: RestoreRemoteSource[];
  targets: StoredTarget[];
};
export type RestoreRemoteEntry = {
  storageId: string;
  key: string;
  size: number;
  contentType?: string;
};
type Plan = { jobId: string; entries: RestoreRemoteEntry[] };
type Options = {
  jobDirectory: string;
  jobId: string;
  encryptionKey: Uint8Array;
  sources: RestoreRemoteSource[];
};
export type RestoreRemote = {
  list(): RestoreRemoteTarget[];
  recoverTests(): void;
  saveTarget(
    storageId: string,
    input: RestoreRemoteTargetInput,
  ): RestoreRemoteTarget;
  testTarget(
    storageId: string,
    input: RestoreRemoteTestInput,
    signal?: AbortSignal,
  ): Promise<RestoreRemoteTarget>;
  beginRestore(
    entries: Iterable<RestoreRemoteEntry>,
    signal?: AbortSignal,
  ): Promise<void>;
  writeObject(
    entry: RestoreRemoteEntry,
    source: Readable,
    signal?: AbortSignal,
  ): Promise<void>;
  finishRestore(signal?: AbortSignal): Promise<void>;
  cleanup(signal?: AbortSignal): Promise<RestoreRemoteTarget[]>;
  configurations(): RestoredRemoteConfiguration[];
};

function namespace(target: { pathPrefix: string; storageId: string }) {
  return `${target.pathPrefix ? `${target.pathPrefix}/` : ''}ariso/${target.storageId}/`;
}
function overlap(
  a: {
    endpoint: string;
    bucket: string;
    pathPrefix: string;
    storageId: string;
  },
  b: typeof a,
) {
  return (
    a.endpoint === b.endpoint &&
    a.bucket === b.bucket &&
    (namespace(a).startsWith(namespace(b)) ||
      namespace(b).startsWith(namespace(a)))
  );
}
function readPrivate<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
function writePrivate(directory: string, name: string, value: unknown) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${name}.part`);
  const file = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(file, `${JSON.stringify(value)}\n`);
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  renameSync(temporary, join(directory, name));
  const parent = openSync(directory, 'r');
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}

export function createRestoreRemote(options: Options): RestoreRemote {
  const crypto = createSecretCrypto(Buffer.from(options.encryptionKey));
  let state = readPrivate<RemoteState>(
    join(options.jobDirectory, 'remote.json'),
  );
  if (state && state.jobId !== options.jobId)
    throw new Error('Restore remote record belongs to another task');
  if (!state) {
    state = { jobId: options.jobId, sources: options.sources, targets: [] };
    writePrivate(options.jobDirectory, 'remote.json', state);
  }
  // Public status reads need only the small control record, not the object ledger.
  let plan: Plan | undefined;
  let planned = new Map<string, RestoreRemoteEntry>();
  const completed = new Set<string>();
  const current = () => state!;
  const persist = () =>
    writePrivate(options.jobDirectory, 'remote.json', current());
  function refresh() {
    state =
      readPrivate<RemoteState>(join(options.jobDirectory, 'remote.json')) ??
      state;
  }
  function refreshPlan() {
    plan = readPrivate<Plan>(join(options.jobDirectory, 'remote-plan.json'));
    if (plan && plan.jobId !== options.jobId)
      throw new Error('Restore remote plan belongs to another task');
    planned = new Map(
      (plan?.entries ?? []).map((entry) => [
        `${entry.storageId}\0${entry.key}`,
        entry,
      ]),
    );
  }
  function patch(item: StoredTarget, values: Partial<StoredTarget>) {
    Object.assign(item, values);
    persist();
  }
  function target(storageId: string) {
    const found = current().targets.find(
      (item) => item.storageId === storageId,
    );
    if (!found)
      throw new BackupError(
        'RESTORE_TARGET_REQUIRED',
        409,
        `请先保存新 S3 目标: ${storageId}`,
      );
    return found;
  }
  function publicTarget(item: StoredTarget): RestoreRemoteTarget {
    return {
      storageId: item.storageId,
      endpoint: item.endpoint,
      region: item.region,
      bucket: item.bucket,
      pathPrefix: item.pathPrefix,
      forcePathStyle: item.forcePathStyle,
      namespace: namespace(item),
      credentialsConfigured: Boolean(
        item.accessKeyEncrypted && item.secretKeyEncrypted,
      ),
      revision: item.revision,
      testedRevision: item.testedRevision,
      testStatus: item.testStatus,
      testedAt: item.testedAt,
      cleanupPending: item.cleanupPending,
      writeStarted: item.writeStarted,
      ...(item.failure ? { failure: { ...item.failure } } : {}),
    };
  }
  function client(item: StoredTarget) {
    return createS3Storage({
      id: item.storageId,
      enabled: true,
      endpoint: item.endpoint,
      region: item.region,
      bucket: item.bucket,
      pathPrefix: item.pathPrefix,
      forcePathStyle: item.forcePathStyle,
      credentials: {
        accessKeyId: crypto.decryptSecret(
          item.accessKeyEncrypted,
          `restore ${item.storageId} accessKey`,
        ),
        secretAccessKey: crypto.decryptSecret(
          item.secretKeyEncrypted,
          `restore ${item.storageId} secretKey`,
        ),
      },
    });
  }
  const errorDetails = (error: unknown) => {
    const safe = stageError(error);
    return {
      code: safe.code ?? 'RESTORE_REMOTE_FAILED',
      message: safe.message,
    };
  };
  async function keys(
    storage: ReturnType<typeof createS3Storage>,
    signal?: AbortSignal,
  ) {
    const result = new Set<string>();
    for await (const page of storage.listObjects({ signal }))
      for (const item of page) result.add(item.key);
    return result;
  }
  function known(item: StoredTarget, found: Set<string>) {
    for (const key of found) {
      if (
        key === ownerKey ||
        key === item.probeKey ||
        planned.has(`${item.storageId}\0${key}`)
      )
        continue;
      throw new BackupError(
        'RESTORE_REMOTE_UNKNOWN_OBJECT',
        409,
        `目标包含本任务名录之外的对象，未删除或覆盖: ${item.storageId}/${key}`,
      );
    }
  }
  async function verifyOwner(
    item: StoredTarget,
    storage: ReturnType<typeof createS3Storage>,
    signal?: AbortSignal,
  ) {
    const { stream } = await storage.readObject(ownerKey, { signal });
    const chunks: Buffer[] = [];
    let length = 0;
    try {
      for await (const chunk of stream) {
        length += chunk.length;
        if (length > 4096)
          throw new BackupError(
            'RESTORE_TARGET_OWNED',
            409,
            '目标的恢复任务标记无效',
          );
        chunks.push(Buffer.from(chunk));
      }
      let owner: { jobId?: string; storageId?: string };
      try {
        owner = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new BackupError(
          'RESTORE_TARGET_OWNED',
          409,
          '目标的恢复任务标记无效',
        );
      }
      if (owner.jobId !== options.jobId || owner.storageId !== item.storageId)
        throw new BackupError(
          'RESTORE_TARGET_OWNED',
          409,
          '目标命名空间正在由另一恢复任务使用',
        );
    } finally {
      stream.destroy();
    }
  }
  function uncertain(item: StoredTarget) {
    return new BackupError(
      'RESTORE_REMOTE_WRITE_UNCERTAIN',
      409,
      `远端尚未确认本次变更结果，仍保留清理责任：${item.storageId}/${item.pending?.key}。请检查提供方请求结果后重试；该请求仍可能在远端继续执行。`,
    );
  }
  function settlePending(item: StoredTarget) {
    patch(item, { pending: undefined });
  }
  async function trackedWrite(
    item: StoredTarget,
    storage: ReturnType<typeof createS3Storage>,
    key: string,
    source: Readable,
    input: {
      size: number;
      contentType: string;
      signal?: AbortSignal;
      ifNoneMatch?: '*';
      startedEmpty: boolean;
    },
  ) {
    try {
      input.signal?.throwIfAborted();
      if (item.pending) throw uncertain(item);
    } catch (error) {
      source.destroy();
      throw error;
    }
    patch(item, {
      pending: { operation: 'put', key, startedEmpty: input.startedEmpty },
      cleanupPending: true,
      cleared: false,
    });
    let supplied = 0;
    let acknowledged = false;
    const counted = Readable.from(
      (async function* () {
        for await (const chunk of source) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          supplied += bytes.length;
          yield bytes;
        }
      })(),
      { objectMode: false },
    );
    const sourceDone = finished(source, { cleanup: true });
    void sourceDone.catch(() => undefined);
    try {
      const result = await storage.writeObject(key, counted, input);
      acknowledged = true;
      await finished(counted, { cleanup: true });
      await sourceDone;
      settlePending(item);
      return result;
    } catch (error) {
      const status = (error as { httpStatusCode?: number }).httpStatusCode;
      // A complete body with no definitive response may still commit at the provider.
      if (
        acknowledged ||
        (status !== undefined && status >= 400 && status < 500) ||
        supplied < input.size
      )
        settlePending(item);
      throw error;
    } finally {
      counted.destroy();
      source.destroy();
      await sourceDone.catch(() => undefined);
    }
  }
  async function trackedDelete(
    item: StoredTarget,
    storage: ReturnType<typeof createS3Storage>,
    key: string,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    if (item.pending) throw uncertain(item);
    patch(item, {
      pending: { operation: 'delete', key },
      cleanupPending: true,
      cleared: false,
    });
    try {
      await storage.deleteObject(key, { signal });
      settlePending(item);
    } catch (error) {
      const status = (error as { httpStatusCode?: number }).httpStatusCode;
      if (status !== undefined && status >= 400 && status < 500)
        settlePending(item);
      throw error;
    }
  }
  async function checkConditionalOwner(
    item: StoredTarget,
    storage: ReturnType<typeof createS3Storage>,
    signal?: AbortSignal,
  ) {
    const bytes = Buffer.from(
      JSON.stringify({ jobId: options.jobId, storageId: item.storageId }),
    );
    try {
      await trackedWrite(item, storage, ownerKey, Readable.from([bytes]), {
        size: bytes.length,
        contentType: 'application/json',
        ifNoneMatch: '*',
        signal,
        startedEmpty: false,
      });
    } catch (error) {
      if ((error as { httpStatusCode?: number }).httpStatusCode === 412) return;
      throw error;
    }
    throw new BackupError(
      'RESTORE_CONDITIONAL_WRITE_UNSUPPORTED',
      409,
      '目标没有执行条件写入，无法区分同时恢复的任务',
    );
  }
  async function claim(
    item: StoredTarget,
    storage: ReturnType<typeof createS3Storage>,
    signal?: AbortSignal,
  ) {
    const found = await keys(storage, signal);
    if (found.has(ownerKey)) {
      await verifyOwner(item, storage, signal);
      known(item, found);
      patch(item, { claim: 'owned', cleanupPending: true, cleared: false });
      await checkConditionalOwner(item, storage, signal);
      return;
    }
    if (
      found.size &&
      (item.cleared ||
        !item.writeStarted ||
        !['owned', 'released'].includes(item.claim))
    )
      throw new BackupError(
        'RESTORE_TARGET_NOT_EMPTY',
        409,
        '新 S3 目标命名空间必须为空',
      );
    known(item, found);
    const previousClaim = item.claim;
    patch(item, { claim: 'claiming', cleanupPending: true, cleared: false });
    const bytes = Buffer.from(
      JSON.stringify({ jobId: options.jobId, storageId: item.storageId }),
    );
    try {
      await trackedWrite(item, storage, ownerKey, Readable.from([bytes]), {
        size: bytes.length,
        contentType: 'application/json',
        ifNoneMatch: '*',
        signal,
        startedEmpty: true,
      });
    } catch (error) {
      if ((error as { httpStatusCode?: number }).httpStatusCode !== 412)
        throw error;
      try {
        await verifyOwner(item, storage, signal);
      } catch (ownershipError) {
        if (
          ownershipError instanceof BackupError &&
          ownershipError.code === 'RESTORE_TARGET_OWNED'
        )
          patch(item, {
            claim: previousClaim === 'owned' ? 'owned' : 'none',
            cleanupPending: previousClaim === 'owned',
          });
        throw ownershipError;
      }
    }
    patch(item, { claim: 'owned', cleanupPending: true, cleared: false });
    await checkConditionalOwner(item, storage, signal);
    known(item, await keys(storage, signal));
  }
  async function cleanupTarget(
    item: StoredTarget,
    signal?: AbortSignal,
    retainOwner = false,
  ) {
    if (
      (item.cleared && !item.pending) ||
      (!item.cleanupPending &&
        !item.pending &&
        !item.writeStarted &&
        !item.probeKey &&
        item.claim !== 'owned')
    )
      return;
    const storage = client(item);
    try {
      const found = await keys(storage, signal);
      if (found.has(ownerKey)) await verifyOwner(item, storage, signal);
      else if (found.size && !['owned', 'released'].includes(item.claim))
        throw new BackupError(
          'RESTORE_TARGET_OWNED',
          409,
          '未确认本任务拥有目标，保留远端对象供检查',
        );
      known(item, found);
      if (item.pending) {
        if (item.pending.operation === 'put') {
          if (!item.pending.startedEmpty || !found.has(item.pending.key))
            throw uncertain(item);
        } else if (found.has(item.pending.key)) throw uncertain(item);
        // Persist the observed outcome before starting a different remote mutation.
        settlePending(item);
      }
      for (const key of found)
        if (key !== ownerKey) {
          await trackedDelete(item, storage, key, signal);
        }
      const remaining = await keys(storage, signal);
      known(item, remaining);
      if ([...remaining].some((key) => key !== ownerKey))
        throw new BackupError(
          'RESTORE_REMOTE_CLEANUP_FAILED',
          500,
          '目标仍有本任务对象，请重试清理',
        );
      let keptOwner = false;
      if (remaining.has(ownerKey)) {
        await verifyOwner(item, storage, signal);
        if (retainOwner) keptOwner = true;
        else {
          await trackedDelete(item, storage, ownerKey, signal);
        }
      }
      patch(item, {
        cleanupPending: keptOwner,
        claim: keptOwner ? 'owned' : 'released',
        probeKey: undefined,
        cleared: !keptOwner,
        failure: undefined,
      });
    } finally {
      storage.destroy();
    }
  }
  return {
    list: () =>
      (
        readPrivate<RemoteState>(join(options.jobDirectory, 'remote.json')) ??
        current()
      ).targets.map(publicTarget),
    recoverTests() {
      refresh();
      let changed = false;
      for (const item of current().targets)
        if (item.testStatus === 'testing') {
          Object.assign(item, {
            testStatus: 'failed',
            testedRevision: null,
            testedAt: Date.now(),
            failure: {
              code: 'RESTORE_TARGET_TEST_INTERRUPTED',
              message:
                '目标测试被服务重启中断，请重新测试；已登记的远端清理范围保留',
            },
          });
          changed = true;
        }
      if (changed) persist();
    },
    saveTarget(storageId, input) {
      refresh();
      const source = current().sources.find(
        (item) => item.storageId === storageId,
      );
      if (!source)
        throw new BackupError(
          'RESTORE_STORAGE_UNKNOWN',
          400,
          '该存储不在备份 S3 清单中',
        );
      const parsed = targetSchema.parse(input);
      const previous = current().targets.find(
        (item) => item.storageId === storageId,
      );
      const coordinates = {
        storageId,
        endpoint: parsed.endpoint,
        region: parsed.region,
        bucket: parsed.bucket,
        pathPrefix: parsed.pathPrefix,
        forcePathStyle: parsed.forcePathStyle,
      };
      if (current().sources.some((item) => overlap(item, coordinates)))
        throw new BackupError(
          'RESTORE_ORIGINAL_NAMESPACE',
          409,
          '新目标不能指向原 S3 命名空间',
        );
      if (
        current().targets.some(
          (item) => item.storageId !== storageId && overlap(item, coordinates),
        )
      )
        throw new BackupError(
          'RESTORE_TARGET_OVERLAP',
          409,
          '恢复目标命名空间不能重叠',
        );
      if (previous?.writeStarted && !previous.cleanupPending)
        throw new BackupError(
          'RESTORE_TARGET_FROZEN',
          409,
          '复制开始后不能修改恢复目标',
        );
      if (
        previous?.cleanupPending &&
        Object.entries(coordinates).some(
          ([key, value]) => previous[key as keyof typeof coordinates] !== value,
        )
      )
        throw new BackupError(
          'RESTORE_TARGET_CLEANUP_REQUIRED',
          409,
          '请先清理当前命名空间；残留期间只能修正凭据',
        );
      const accessKeyEncrypted =
        parsed.accessKey === undefined
          ? previous?.accessKeyEncrypted
          : parsed.accessKey && crypto.encryptSecret(parsed.accessKey);
      const secretKeyEncrypted =
        parsed.secretKey === undefined
          ? previous?.secretKeyEncrypted
          : parsed.secretKey && crypto.encryptSecret(parsed.secretKey);
      if (!accessKeyEncrypted || !secretKeyEncrypted)
        throw new BackupError(
          'RESTORE_TARGET_CREDENTIALS_REQUIRED',
          400,
          '首次保存需要完整 S3 凭据',
        );
      const saved: StoredTarget = {
        ...coordinates,
        accessKeyEncrypted,
        secretKeyEncrypted,
        revision: (previous?.revision ?? source.configRevision) + 1,
        testedRevision: null,
        testedAt: null,
        testStatus: 'untested',
        cleanupPending: previous?.cleanupPending ?? false,
        writeStarted: previous?.writeStarted ?? false,
        claim: previous?.claim ?? 'none',
        cleared: previous?.cleared,
        pending: previous?.pending,
        ...(previous?.probeKey ? { probeKey: previous.probeKey } : {}),
      };
      const next = {
        ...current(),
        targets: [
          ...current().targets.filter((item) => item.storageId !== storageId),
          saved,
        ],
      };
      writePrivate(options.jobDirectory, 'remote.json', next);
      state = next;
      return publicTarget(saved);
    },
    testTarget(storageId, input, signal) {
      refresh();
      refreshPlan();
      const item = target(storageId);
      if (input.revision !== item.revision)
        throw new BackupError(
          'RESTORE_TARGET_TEST_STALE',
          409,
          '目标配置已修改，请测试当前版本',
        );
      if (item.writeStarted)
        throw new BackupError(
          'RESTORE_TARGET_FROZEN',
          409,
          '复制开始后不能重新测试目标',
        );
      patch(item, {
        testStatus: 'testing',
        testedRevision: null,
        testedAt: null,
        failure: undefined,
      });
      return (async () => {
        if (item.cleanupPending) {
          try {
            await cleanupTarget(item, signal);
          } catch (error) {
            patch(item, { testStatus: 'failed', failure: errorDetails(error) });
            throw error;
          }
        }
        let storage: ReturnType<typeof createS3Storage>;
        try {
          storage = client(item);
        } catch (error) {
          patch(item, {
            testStatus: 'failed',
            testedAt: Date.now(),
            failure: errorDetails(error),
          });
          throw error;
        }
        const report = createConnectionReport({
          storageId,
          revision: item.revision,
          cleanupPending: false,
          wholeBucketHasNoLockRules: input.wholeBucketHasNoLockRules,
          deploymentRequirement:
            'Bucket 必须保持私有，并关闭公共域名/CDN 等旁路；测试不枚举公共别名。',
        });
        const key = `restore/probes/${report.probeId}`;
        try {
          await runConnectionTest({
            storage,
            key,
            report,
            signal,
            formatError: stageError,
            afterConfiguration: (checkSignal) =>
              claim(item, storage, checkSignal),
            async write(bytes, writeSignal) {
              patch(item, { probeKey: key, cleanupPending: true });
              const result = await trackedWrite(
                item,
                storage,
                key,
                Readable.from([bytes]),
                {
                  size: bytes.length,
                  contentType: 'application/octet-stream',
                  signal: writeSignal,
                  startedEmpty: true,
                },
              );
              return result.metadata;
            },
            cleanup: (cleanupSignal) => cleanupTarget(item, cleanupSignal),
            onStage(stage) {
              if (stage.status !== 'failed') return;
              patch(item, {
                ...(stage.stage === 'delete' ? { cleanupPending: true } : {}),
                failure: {
                  code: stage.error?.code ?? 'RESTORE_REMOTE_FAILED',
                  message: stage.error!.message,
                },
              });
            },
          });
          const failure = report.stages.findLast(
            (entry) => entry.status === 'failed',
          )?.error;
          patch(item, {
            testStatus: report.passed ? 'passed' : 'failed',
            testedRevision: report.passed ? item.revision : null,
            testedAt: Date.now(),
            connectionReport: report,
            failure: failure
              ? {
                  code: failure.code ?? 'RESTORE_REMOTE_TEST_FAILED',
                  message: failure.message,
                }
              : undefined,
          });
          return publicTarget(item);
        } finally {
          storage.destroy();
        }
      })();
    },
    async beginRestore(entries, signal) {
      refresh();
      refreshPlan();
      const next = [...entries];
      const unique = new Set<string>();
      for (const entry of next) {
        target(entry.storageId);
        const key = `${entry.storageId}\0${entry.key}`;
        if (
          entry.key === ownerKey ||
          entry.key.startsWith('restore/probes/') ||
          unique.has(key)
        )
          throw new BackupError(
            'RESTORE_REMOTE_PLAN_INVALID',
            400,
            '恢复对象与任务保留路径冲突或重复',
          );
        unique.add(key);
      }
      if (
        plan &&
        (planned.size !== unique.size ||
          next.some((entry) => {
            const previous = planned.get(`${entry.storageId}\0${entry.key}`);
            return (
              !previous ||
              previous.size !== entry.size ||
              previous.contentType !== entry.contentType
            );
          }))
      )
        throw new BackupError(
          'RESTORE_REMOTE_PLAN_CHANGED',
          409,
          '同一恢复任务不能更换远端对象清单',
        );
      for (const source of current().sources) {
        const item = target(source.storageId);
        if (
          item.testStatus !== 'passed' ||
          item.testedRevision !== item.revision
        )
          throw new BackupError(
            'RESTORE_TARGET_TEST_REQUIRED',
            409,
            '请先测试全部当前 S3 目标配置',
          );
      }
      if (!plan) {
        plan = { jobId: options.jobId, entries: next };
        writePrivate(options.jobDirectory, 'remote-plan.json', plan);
        planned = new Map(
          next.map((entry) => [`${entry.storageId}\0${entry.key}`, entry]),
        );
      }
      completed.clear();
      for (const item of current().targets) {
        // A retry starts from empty payload keys, so an old confirmed object cannot
        // be mistaken for a later unacknowledged PUT of the same key.
        if (item.pending) await cleanupTarget(item, signal, true);
        const storage = client(item);
        try {
          await claim(item, storage, signal);
          if (item.writeStarted) await cleanupTarget(item, signal, true);
          patch(item, {
            writeStarted: true,
            cleanupPending: true,
            cleared: false,
            failure: undefined,
          });
        } finally {
          storage.destroy();
        }
      }
    },
    async writeObject(entry, source, signal) {
      const item = target(entry.storageId);
      const key = `${entry.storageId}\0${entry.key}`;
      const expected = planned.get(key);
      if (
        !expected ||
        expected.size !== entry.size ||
        item.claim !== 'owned' ||
        !item.writeStarted
      ) {
        source.destroy();
        throw new BackupError(
          'RESTORE_REMOTE_PLAN_INVALID',
          409,
          '远端对象没有已持久化的恢复写入计划',
        );
      }
      const storage = client(item);
      try {
        await trackedWrite(item, storage, entry.key, source, {
          size: entry.size,
          contentType: entry.contentType ?? 'application/octet-stream',
          signal,
          startedEmpty: true,
        });
        await finished(source, { cleanup: true });
        completed.add(key);
      } catch (error) {
        patch(item, { cleanupPending: true, failure: errorDetails(error) });
        throw error;
      } finally {
        storage.destroy();
      }
    },
    async finishRestore(signal) {
      if (completed.size !== planned.size)
        throw new BackupError(
          'RESTORE_REMOTE_INCOMPLETE',
          409,
          '远端对象尚未全部写入完成',
        );
      for (const item of current().targets) {
        if (item.pending) throw uncertain(item);
        const storage = client(item);
        try {
          const listed = new Map<string, number>();
          for await (const page of storage.listObjects({ signal }))
            for (const entry of page) listed.set(entry.key, entry.size);
          const found = new Set(listed.keys());
          known(item, found);
          for (const expected of planned.values())
            if (
              expected.storageId === item.storageId &&
              listed.get(expected.key) !== expected.size
            )
              throw new BackupError(
                'RESTORE_REMOTE_INCOMPLETE',
                409,
                `目标对象缺失或长度不符: ${item.storageId}/${expected.key}`,
              );
          if (found.has(ownerKey)) {
            await verifyOwner(item, storage, signal);
            await trackedDelete(item, storage, ownerKey, signal);
          }
          patch(item, {
            claim: 'released',
            cleanupPending: false,
            failure: undefined,
          });
        } finally {
          storage.destroy();
        }
      }
    },
    async cleanup(signal) {
      refresh();
      refreshPlan();
      let failed = false;
      let writeUncertain = false;
      for (const item of current().targets) {
        try {
          await cleanupTarget(item, signal);
        } catch (error) {
          failed = true;
          writeUncertain ||=
            (error as { code?: string }).code ===
            'RESTORE_REMOTE_WRITE_UNCERTAIN';
          patch(item, { cleanupPending: true, failure: errorDetails(error) });
        }
      }
      if (writeUncertain)
        throw new BackupError(
          'RESTORE_REMOTE_WRITE_UNCERTAIN',
          409,
          '远端仍有未确认变更，目标与清理责任已保留，请检查提供方请求结果后重试',
        );
      if (failed)
        throw new BackupError(
          'RESTORE_REMOTE_CLEANUP_FAILED',
          500,
          '部分 S3 目标尚未清理，目标位置与错误已保留，请重试',
        );
      return current().targets.map(publicTarget);
    },
    configurations() {
      refresh();
      return current().sources.map((source) => {
        const item = target(source.storageId);
        if (
          item.testStatus !== 'passed' ||
          item.testedRevision !== item.revision ||
          !item.connectionReport ||
          item.testedAt === null
        )
          throw new BackupError(
            'RESTORE_TARGET_TEST_REQUIRED',
            409,
            '请测试当前 S3 目标配置',
          );
        return {
          storageId: item.storageId,
          endpoint: item.endpoint,
          region: item.region,
          bucket: item.bucket,
          pathPrefix: item.pathPrefix,
          forcePathStyle: item.forcePathStyle,
          accessKeyEncrypted: item.accessKeyEncrypted,
          secretKeyEncrypted: item.secretKeyEncrypted,
          revision: item.revision,
          testedAt: item.testedAt,
          connectionReport: item.connectionReport,
        };
      });
    },
  };
}
