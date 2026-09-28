import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { newLatePutReport } from '../../experiments/upload-late-put/report.ts';
import { runService } from '../../experiments/upload-late-put/suite.ts';

it.each(['accept', 'early-reject-delayed-body'] as const)(
  'records late PUT evidence without false acceptance: %s',
  async (mode) => {
    const objects = new Map<string, number>();
    const server = createServer(async (request, response) => {
      const url = new URL(request.url!, 'http://localhost');
      if (url.searchParams.has('versioning')) {
        response.end(
          '<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>',
        );
        return;
      }
      if (url.searchParams.has('object-lock')) {
        response.writeHead(404);
        response.end(
          '<Error><Code>ObjectLockConfigurationNotFoundError</Code></Error>',
        );
        return;
      }
      if (request.method === 'HEAD') {
        const size = objects.get(url.pathname);
        response.writeHead(size === undefined ? 404 : 200, {
          ...(size === undefined
            ? {}
            : { 'content-length': size, etag: '"fixture"' }),
        });
        response.end();
        return;
      }
      if (request.method === 'DELETE') {
        objects.delete(url.pathname);
        response.writeHead(204);
        response.end();
        return;
      }
      const date = url.searchParams.get('X-Amz-Date');
      if (date) {
        const started = Date.parse(
          date.replace(
            /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
            '$1-$2-$3T$4:$5:$6Z',
          ),
        );
        if (
          Date.now() >
          started + Number(url.searchParams.get('X-Amz-Expires')) * 1000
        ) {
          response.writeHead(403);
          response.end('<Error><Code>AccessDenied</Code></Error>');
          return;
        }
      }
      if (
        mode === 'early-reject-delayed-body' &&
        Number(request.headers['content-length']) === 32 * 65536
      ) {
        response.writeHead(403);
        response.flushHeaders();
        await delay(6500);
        response.end('<Error><Code>AccessDenied</Code></Error>');
        return;
      }
      try {
        let size = 0;
        for await (const chunk of request) size += chunk.length;
        if (request.headers['x-amz-copy-source']) {
          objects.set(url.pathname, 65536);
          response.end(
            '<CopyObjectResult><ETag>"fixture"</ETag><LastModified>2026-01-01T00:00:00.000Z</LastModified></CopyObjectResult>',
          );
        } else {
          objects.set(url.pathname, size);
          response.setHeader('etag', '"fixture"');
          response.end();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') throw error;
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing local address');
    const config = {
      service: 'seaweedfs' as const,
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'fixture',
      forcePathStyle: true,
      credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
      serviceVersion: 'local model, not real SeaweedFS',
      revision: 'fixture',
      ownerConfirmation: {
        revision: 'fixture',
        privateBucketAndNoPublicAliases: true as const,
        evidence: 'local model only',
      },
    };
    const report = newLatePutReport('seaweedfs', 4);
    const checkpoints: string[] = [];
    const previousSpace = process.env.EGO_TASK_SPACE;
    delete process.env.EGO_TASK_SPACE;
    try {
      await runService(
        config,
        report,
        async () => {
          checkpoints.push(JSON.stringify(report));
        },
        '/unused',
      );
      if (mode === 'early-reject-delayed-body') {
        expect(report.status).toBe('failed');
        const rejected = report.checks.find(
          (check) => check.name === 'upload:start-before-expiry-finish-after',
        );
        expect(rejected?.status).toBe('failed');
        expect(report.release.permitted).toBe(false);
        expect(objects.size).toBe(0);
        return;
      }
      expect(
        report.checks.filter((check) => check.status === 'failed'),
      ).toEqual([]);
      expect(report.status).toBe('incomplete');
      expect(report.release.permitted).toBe(false);
      for (const role of ['upload', 'probe']) {
        const check = report.checks.find(
          (check) => check.name === `${role}:start-before-expiry-finish-after`,
        );
        expect(check).toMatchObject({
          status: 'passed',
          evidence: {
            late: { status: 200 },
            duringWrite: { head: { exists: false } },
            startsBeforeExpiry: true,
            bodyFinishesAfterExpiry: true,
            head: { exists: true, bytes: 32 * 65536 },
            referenceRetained: true,
          },
        });
      }
      expect(
        report.checks.find((check) => check.name === 'real-browser-cors-probe')
          ?.status,
      ).toBe('incomplete');
      expect(report.keys).toHaveLength(4);
      expect(objects.size).toBe(0);
      expect(checkpoints.length).toBeGreaterThan(10);
      expect(checkpoints.join('\n')).not.toMatch(
        /X-Amz-(Credential|Signature|Security-Token)/,
      );
    } finally {
      if (previousSpace !== undefined)
        process.env.EGO_TASK_SPACE = previousSpace;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  25_000,
);
