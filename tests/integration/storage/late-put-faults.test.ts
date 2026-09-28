import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runFaults } from '../../experiments/upload-late-put/faults.ts';

it('records lost PUT/Copy responses and a killed owner without losing exact-key cleanup responsibility', async () => {
  const objects = new Map<string, Buffer>();
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (request.method === 'DELETE') {
      objects.delete(path);
      response.writeHead(204).end();
    } else if (request.method === 'HEAD' || request.method === 'GET') {
      const body = objects.get(path);
      response.writeHead(
        body ? 200 : 404,
        body ? { 'content-length': body.length } : {},
      );
      response.end(request.method === 'GET' ? body : undefined);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const source = request.headers['x-amz-copy-source'];
      objects.set(
        path,
        source
          ? objects.get(decodeURIComponent(String(source)))!
          : Buffer.concat(chunks),
      );
      response.end(
        source
          ? '<CopyObjectResult><ETag>"fixture"</ETag><LastModified>2026-01-01T00:00:00Z</LastModified></CopyObjectResult>'
          : '',
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No endpoint');
  const directory = await mkdtemp(join(tmpdir(), 'late-put-faults-'));
  try {
    const report = await runFaults(
      {
        service: 'seaweedfs',
        endpoint: `http://127.0.0.1:${address.port}`,
        region: 'us-east-1',
        bucket: 'fixture',
        forcePathStyle: true,
        credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
      },
      directory,
      80,
    );
    expect(report.lostResponses).toHaveLength(2);
    for (const loss of report.lostResponses) {
      expect(loss.provider.status).toBe(200);
      expect(loss.clientError.name).toBe('InjectedResponseLoss');
      expect(loss.actualSha256).toBe(loss.expectedSha256);
    }
    expect(report.recovery).toMatchObject({
      ownerSignal: 'SIGKILL',
      afterEarlyDelete: false,
      afterWriterCompleted: true,
      responsibilityRetained: true,
    });
    expect(report.cleanup.every((entry) => entry.absent)).toBe(true);
    expect(objects.size).toBe(0);
    expect(
      JSON.parse(await readFile(join(directory, 'responsibility.json'), 'utf8'))
        .key,
    ).toBe(report.keys[2]);
    expect(report.productionReleasePermitted).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);

it('服务写入失败时保留错误并尝试清理全部已登记Key', async () => {
  const deleted: string[] = [];
  const server = createServer((request, response) => {
    const key = new URL(request.url!, 'http://localhost').pathname;
    if (request.method === 'DELETE') {
      deleted.push(key);
      response.writeHead(204).end();
    } else if (request.method === 'HEAD') {
      response.writeHead(404).end();
    } else {
      request.resume();
      response.writeHead(500, { 'content-type': 'application/xml' });
      response.end(
        '<Error><Code>InternalError</Code><Message>injected provider failure</Message></Error>',
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No endpoint');
  const directory = await mkdtemp(join(tmpdir(), 'late-put-faults-failed-'));
  try {
    await expect(
      runFaults(
        {
          service: 'seaweedfs',
          endpoint: `http://127.0.0.1:${address.port}`,
          region: 'us-east-1',
          bucket: 'fixture',
          forcePathStyle: true,
          credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
        },
        directory,
        80,
      ),
    ).rejects.toThrow();
    const report = JSON.parse(
      await readFile(join(directory, 'report.json'), 'utf8'),
    );
    expect(report.failure).toBeDefined();
    expect(report.failure.message).toContain('500');
    expect(deleted).toEqual(
      report.keys.map((key: string) => `/fixture/${key}`),
    );
    expect(report.cleanup).toHaveLength(3);
    expect(
      report.cleanup.every((entry: { absent: boolean }) => entry.absent),
    ).toBe(true);
    expect(report.recovery).toEqual({});
    expect(report.productionReleasePermitted).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
