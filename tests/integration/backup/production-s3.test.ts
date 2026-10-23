import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { verifyBackupS3Provider } from '../../../scripts/verify-backup-s3.ts';
import { remoteEndpoint } from './restore-remote-fixture.ts';

it('uses the real packaged HTTP flow to restore a small Local/two-S3 backup after deleting all original data', async () => {
  const endpoint = await remoteEndpoint();
  const directory = await mkdtemp(join(tmpdir(), 'ariso-backup-s3-http-'));
  try {
    const report = await verifyBackupS3Provider(
      {
        service: 'seaweedfs',
        serviceVersion:
          'local SDK protocol fixture; not a provider compatibility result',
        endpoint: endpoint.endpoint,
        region: 'test',
        bucket: 'test',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'fixture-access',
          secretAccessKey: 'fixture-secret',
        },
      },
      directory,
    );
    expect(report.status, JSON.stringify(report.error)).toBe('passed');
    expect(report.sample.sourceImages).toBe(3);
    expect(report.sample.pngBytes).toBeLessThan(4096);
    expect(report.sample.backupBytes).toBeLessThan(4 * 1024 * 1024);
    expect(report.sourceRemoval).toHaveLength(2);
    expect(report.cleanup.every((row) => row.status === 'passed')).toBe(true);
    expect(endpoint.objects.size).toBe(0);
  } finally {
    await endpoint.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
