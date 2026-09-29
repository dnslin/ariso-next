import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { createClient } from '../../experiments/storage-s3/protocol.ts';
import {
  inspectSampleObject,
  listSampleObjects,
} from '../../experiments/analytics-usage/remote.ts';

it('reads every listing page and preserves missing byte counts as unknown', async () => {
  const requests: URL[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    requests.push(url);
    res.setHeader('content-type', 'application/xml');
    if (url.searchParams.get('continuation-token') === 'page2') {
      res.end(
        '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>sample/b</Key></Contents></ListBucketResult>',
      );
    } else {
      res.end(
        '<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>page2</NextContinuationToken><Contents><Key>sample/a</Key><Size>42</Size></Contents></ListBucketResult>',
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No test address');
  const client = createClient({
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  try {
    expect(await listSampleObjects(client, 'test', 'sample/')).toEqual([
      { key: 'sample/a', bytes: 42 },
      { key: 'sample/b', bytes: null },
    ]);
    expect(requests).toHaveLength(2);
    expect(
      requests.every((url) => url.searchParams.get('prefix') === 'sample/'),
    ).toBe(true);
  } finally {
    client.destroy();
    server.close();
    await once(server, 'close');
  }
});

it('does not turn a denied HEAD into absent or zero bytes', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(403);
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No test address');
  const client = createClient({
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  try {
    await expect(
      inspectSampleObject(client, 'test', 'sample/a'),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
  } finally {
    client.destroy();
    server.close();
    await once(server, 'close');
  }
});

it('exercises the remote runner against a local protocol model without claiming provider validation', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runUsageService } =
    await import('../../experiments/analytics-usage/live.ts');
  const directory = await mkdtemp(join(tmpdir(), 'analytics-usage-model-'));
  const objects = new Map<string, number>();
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const key = decodeURIComponent(url.pathname.slice('/test/'.length));
    if (req.method === 'PUT') {
      let bytes = 0;
      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
      });
      req.on('end', () => {
        objects.set(key, bytes);
        res.end();
      });
    } else if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204);
      res.end();
    } else if (req.method === 'HEAD') {
      res.writeHead(
        objects.has(key) ? 200 : 404,
        objects.has(key) ? { 'content-length': objects.get(key)! } : {},
      );
      res.end();
    } else {
      const entries = [...objects]
        .filter(([name]) => name.startsWith(url.searchParams.get('prefix')!))
        .sort(([a], [b]) => a.localeCompare(b));
      const start = Number(url.searchParams.get('continuation-token') ?? 0);
      const page = entries.slice(start, start + 2);
      const truncated = entries.length > start + 2;
      res.setHeader('content-type', 'application/xml');
      res.end(
        `<ListBucketResult><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${start + 2}</NextContinuationToken>` : ''}${page.map(([name, bytes]) => `<Contents><Key>${name}</Key><Size>${bytes}</Size></Contents>`).join('')}</ListBucketResult>`,
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No test address');
  try {
    const report = await runUsageService(
      {
        service: 'seaweedfs',
        endpoint: `http://127.0.0.1:${address.port}`,
        bucket: 'test',
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      },
      directory,
    );
    expect(report.status, JSON.stringify(report.observations)).toBe('passed');
    expect(report.observations.map((item) => item.name)).toContain(
      'scan-discovers-orphan-and-preserves-live-references',
    );
    expect(objects.size).toBe(0);
    expect(report.cleanup).toHaveLength(4);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);

it('closes SQLite when the first report write fails before remote I/O', async () => {
  const { mkdtemp, mkdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const { vi } = await import('vitest');
  const { runUsageService } =
    await import('../../experiments/analytics-usage/live.ts');
  const directory = await mkdtemp(join(tmpdir(), 'analytics-report-failure-'));
  await mkdir(join(directory, 'report.json'));
  const close = vi.spyOn(Database.prototype, 'close');
  try {
    await expect(
      runUsageService(
        {
          service: 'seaweedfs',
          endpoint: 'http://127.0.0.1:1',
          bucket: 'test',
          region: 'us-east-1',
          forcePathStyle: true,
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
        directory,
      ),
    ).rejects.toMatchObject({ code: 'EISDIR' });
    expect(close).toHaveBeenCalledOnce();
  } finally {
    close.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

it('cleans an ambiguous failed PUT and records a failed cleanup without reporting success', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runUsageService } =
    await import('../../experiments/analytics-usage/live.ts');
  const directory = await mkdtemp(join(tmpdir(), 'analytics-cleanup-failure-'));
  const methods: string[] = [];
  const server = createServer((req, res) => {
    methods.push(req.method!);
    req.resume();
    req.on('end', () => {
      res.writeHead(req.method === 'DELETE' ? 403 : 500, {
        'content-type': 'application/xml',
      });
      res.end(
        '<Error><Code>InjectedFailure</Code><Message>test failure</Message></Error>',
      );
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No test address');
  try {
    const report = await runUsageService(
      {
        service: 'seaweedfs',
        endpoint: `http://127.0.0.1:${address.port}`,
        bucket: 'test',
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      },
      directory,
    );
    expect(report.status).toBe('failed');
    expect(methods).toEqual(['PUT', 'DELETE']);
    expect(report.cleanup).toHaveLength(1);
    expect(report.cleanup[0].error).toMatchObject({ httpStatusCode: 403 });
    expect(report.observations.at(-1)?.name).toBe('failure');
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
});
