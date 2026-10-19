import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { collectionFixture } from '../../integration/collections/helpers.ts';
import { runLiveUploadTarget } from '../../integration/upload/live-storage-fixture.ts';

const boundary = vi.hoisted(() => ({ storage: vi.fn(), fixture: vi.fn() }));
vi.mock('../../../src/server/storage/s3.ts', () => ({
  createS3Storage: boundary.storage,
}));
vi.mock('../../integration/upload/api-fixture.ts', () => ({
  publicUploadFixture: boundary.fixture,
}));

it.each(['passed', 'scenario-failed', 'cleanup-failed'] as const)(
  'persists %s and cleans tracked objects after stopping the fixture',
  async (outcome) => {
    const local = collectionFixture();
    const output = await mkdtemp(join(tmpdir(), 'ariso-live-report-'));
    const objects = new Set(['original/owned.png']);
    let stopped = false;
    let destroyed = false;
    const client = {
      async *listObjects() {
        expect(stopped).toBe(true);
        yield [...objects].map((key) => ({ key }));
      },
      async deleteObject(key: string) {
        expect(stopped).toBe(true);
        if (outcome === 'cleanup-failed') throw new Error('delete denied');
        objects.delete(key);
      },
      async inspectObject(key: string) {
        return objects.has(key) ? { key } : null;
      },
      destroy() {
        destroyed = true;
      },
    };
    boundary.storage.mockReturnValue(client);
    boundary.fixture.mockResolvedValue({
      connection: { db: local.db },
      async ownerJson(path: string, method: string, body: object) {
        if (path === '/api/storages') {
          expect(method).toBe('POST');
          expect(body).toMatchObject({ type: 's3', pathPrefix: '' });
          return Response.json(
            { id: 'own-storage', configRevision: 1 },
            { status: 201 },
          );
        }
        if (path.endsWith('/test'))
          return Response.json({ passed: true, cleanupPending: false });
        expect(body).toEqual({ enabled: true });
        return Response.json({ enabled: true });
      },
      async close() {
        stopped = true;
      },
    });
    try {
      const passed = await runLiveUploadTarget(
        {
          service: 'seaweedfs',
          endpoint: 'http://127.0.0.1:9000',
          region: 'test',
          bucket: 'test',
          forcePathStyle: true,
          credentials: {
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
          },
        },
        output,
        {
          name: 'shared lifecycle test',
          limits: ['Controlled storage boundary only'],
          metadata: { caller: 'test' },
          async verify({ storageId, track, onCheck }) {
            expect(storageId).toBe('own-storage');
            track('original/owned.png');
            await onCheck({ name: 'caller-check', detail: { public: true } });
            if (outcome === 'scenario-failed')
              throw new Error('scenario failed');
          },
        },
      );
      const report = JSON.parse(
        await readFile(join(output, 'seaweedfs.json'), 'utf8'),
      );
      expect(passed).toBe(outcome === 'passed');
      expect(report.status).toBe(outcome === 'passed' ? 'passed' : 'failed');
      expect(report).toMatchObject({
        caller: 'test',
        storageId: 'own-storage',
      });
      expect(report.finishedAt).toEqual(expect.any(String));
      expect(report.checks).toContainEqual({
        name: 'caller-check',
        status: 'passed',
        detail: { public: true },
      });
      if (outcome === 'scenario-failed')
        expect(report.checks).toContainEqual({
          name: 'runner',
          status: 'failed',
          detail: 'scenario failed',
        });
      if (outcome === 'cleanup-failed') {
        expect([...objects]).toEqual(['original/owned.png']);
        expect(report.cleanup[0]).toMatchObject({
          key: 'original/owned.png',
          result: 'failed',
          error: 'delete denied',
        });
      } else {
        expect(objects.size).toBe(0);
        expect(report.cleanup).toEqual([
          { key: 'original/owned.png', result: 'absent' },
        ]);
      }
      expect(stopped && destroyed).toBe(true);
    } finally {
      local.close();
      await rm(output, { recursive: true, force: true });
    }
  },
);
