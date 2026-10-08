import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import { runCurrentUsageService } from '../../experiments/analytics-current-usage/live.ts';

const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
const target = {
  service: 'seaweedfs' as const,
  endpoint: 'http://127.0.0.1:1',
  region: 'us-east-1',
  bucket: 'test',
  forcePathStyle: true,
  credentials,
};

it('closes the production SQLite connection when writing the first report fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'current-usage-report-'));
  await mkdir(join(directory, 'report.json'));
  const close = vi.spyOn(Database.prototype, 'close');
  try {
    await expect(
      runCurrentUsageService(target, directory),
    ).rejects.toMatchObject({ code: 'EISDIR' });
    expect(close).toHaveBeenCalledOnce();
  } finally {
    close.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

it('retains failed PUT and cleanup evidence and never reports a cleanup failure as success', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'current-usage-cleanup-'));
  const methods: string[] = [];
  const server = createServer((req, res) => {
    methods.push(req.method!);
    req.resume();
    req.on('end', () => {
      if (req.method === 'GET') {
        res.setHeader('content-type', 'application/xml');
        res.end(
          '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
        );
        return;
      }
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
    const report = await runCurrentUsageService(
      { ...target, endpoint: `http://127.0.0.1:${address.port}` },
      directory,
    );
    expect(report.status).toBe('failed');
    expect(methods).toEqual(['GET', 'PUT', 'DELETE']);
    expect(report.cleanup).toHaveLength(1);
    expect(report.cleanup[0].error).toMatchObject({ httpStatusCode: 403 });
    expect(report.observations.at(-1)?.name).toBe('failure');
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
});

it('reconciles production provider records through handoff, scanner and trash against a local protocol model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'current-usage-model-'));
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
      const entries = [...objects].filter(([name]) =>
        name.startsWith(url.searchParams.get('prefix')!),
      );
      res.setHeader('content-type', 'application/xml');
      res.end(
        `<ListBucketResult><IsTruncated>false</IsTruncated>${entries.map(([name, bytes]) => `<Contents><Key>${name}</Key><Size>${bytes}</Size></Contents>`).join('')}</ListBucketResult>`,
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No test address');
  try {
    const report = await runCurrentUsageService(
      { ...target, endpoint: `http://127.0.0.1:${address.port}` },
      directory,
    );
    expect(report.status, JSON.stringify(report.observations)).toBe('passed');
    expect(report.observations.map((observation) => observation.name)).toEqual(
      expect.arrayContaining([
        'handoff-rollback',
        'handoff-retained-temporary',
        'candidate-old-probe',
        'trash',
        'restore',
        'late-unregistered',
        'scanner-retains-orphan-after-injected-delete-failure',
        'scanner-retry-deletes-orphan',
        'empty-after-confirmed-deletions',
      ]),
    );
    expect(objects.size).toBe(0);
    expect(report.cleanup).toHaveLength(7);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
