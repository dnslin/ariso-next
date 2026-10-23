import { randomBytes, randomUUID } from 'node:crypto';
import type { createS3Storage } from './s3.ts';
import type { ConnectionReport, ProbeStageResult } from './probe-types.ts';

export function createConnectionReport(options: {
  storageId: string;
  revision: number;
  cleanupPending: boolean;
  wholeBucketHasNoLockRules?: boolean;
  deploymentRequirement: string;
}): ConnectionReport {
  return {
    probeId: randomUUID(),
    storageId: options.storageId,
    revision: options.revision,
    passed: false,
    stale: false,
    cleanupPending: options.cleanupPending,
    stages: (
      ['configuration', 'write', 'read', 'anonymous', 'delete'] as const
    ).map((stage) => ({ stage, status: 'pending' })),
    deploymentRequirement: options.deploymentRequirement,
    testedAt: new Date().toISOString(),
    ownerConfirmation: {
      wholeBucketHasNoLockRules: options.wholeBucketHasNoLockRules === true,
      confirmedAt: options.wholeBucketHasNoLockRules
        ? new Date().toISOString()
        : null,
    },
  };
}

/** Both callers own their write journal and cleanup; the five checks stay identical. */
export async function runConnectionTest(options: {
  storage: Pick<
    ReturnType<typeof createS3Storage>,
    'checkBucket' | 'readObject' | 'checkAnonymous'
  >;
  key: string;
  report: ConnectionReport;
  signal?: AbortSignal;
  afterConfiguration?(signal: AbortSignal): Promise<void>;
  write(bytes: Buffer, signal: AbortSignal): Promise<unknown>;
  cleanup(signal: AbortSignal): Promise<unknown>;
  shouldCleanup?(): boolean;
  onStage?(stage: ProbeStageResult): void;
  formatError(error: unknown): NonNullable<ProbeStageResult['error']>;
}) {
  const { storage, key, report } = options;
  const bounded = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(30_000),
  ]);
  let stage = report.stages[0];
  async function perform(
    name: ProbeStageResult['stage'],
    operation: () => Promise<unknown>,
  ) {
    stage = report.stages.find((item) => item.stage === name)!;
    options.onStage?.(stage);
    stage.evidence = await operation();
    stage.status = 'passed';
    options.onStage?.(stage);
  }
  function fail(error: unknown) {
    stage.status = 'failed';
    stage.error = options.formatError(error);
    options.onStage?.(stage);
  }
  try {
    await perform('configuration', async () => {
      const evidence = await storage.checkBucket({
        r2NoBucketLocksConfirmed:
          report.ownerConfirmation.wholeBucketHasNoLockRules,
        signal: bounded,
      });
      await options.afterConfiguration?.(bounded);
      return evidence;
    });
    const bytes = randomBytes(64);
    await perform('write', () => options.write(bytes, bounded));
    await perform('read', async () => {
      const result = await storage.readObject(key, { signal: bounded });
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of result.stream) {
          size += chunk.length;
          if (size > bytes.length) throw new Error('探测读取字节与写入不一致');
          chunks.push(Buffer.from(chunk));
        }
        if (!Buffer.concat(chunks).equals(bytes))
          throw new Error('探测读取字节与写入不一致');
        return result.metadata;
      } finally {
        result.stream.destroy();
      }
    });
    await perform('anonymous', () =>
      storage.checkAnonymous(key, { signal: bounded }),
    );
  } catch (error) {
    fail(error);
    for (const item of report.stages)
      if (item.status === 'pending' && item.stage !== 'delete')
        item.status = 'skipped';
  }
  if (options.shouldCleanup?.() === false) {
    report.stages[4].status = 'skipped';
    report.cleanupPending = false;
  } else {
    try {
      // Cleanup has its own budget after the main checks fail or are cancelled.
      await perform('delete', () =>
        options.cleanup(AbortSignal.timeout(30_000)),
      );
      report.cleanupPending = false;
    } catch (error) {
      report.cleanupPending = true;
      fail(error);
    }
  }
  report.passed = report.stages.every((item) => item.status === 'passed');
  report.testedAt = new Date().toISOString();
  return report;
}
