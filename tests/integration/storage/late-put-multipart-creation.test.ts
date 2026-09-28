import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import {
  runCreation,
  type CreationReport,
} from '../../experiments/upload-late-put/multipart-creation.ts';

it.each([
  'normal',
  'truncated',
  'list-fails',
  'create-fails',
  'abort-fails',
] as const)('Create响应丢失恢复只清理精确Key，保留失败（%s）', async (mode) => {
  const saved: CreationReport[] = [];
  const sessions = new Set<string>();
  let exactKey = '';
  let created = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    res.setHeader('content-type', 'application/xml');
    if (req.method === 'POST') {
      exactKey = decodeURIComponent(url.pathname.slice('/test/'.length));
      expect(saved[0].key).toBe(exactKey);
      created++;
      if (mode === 'create-fails')
        return void res
          .writeHead(500)
          .end('<Error><Code>InternalError</Code></Error>');
      sessions.add('owned');
      res.end(
        '<InitiateMultipartUploadResult><UploadId>owned</UploadId></InitiateMultipartUploadResult>',
      );
    } else if (req.method === 'GET') {
      expect(url.searchParams.get('prefix')).toBe(exactKey);
      if (mode === 'list-fails')
        return void res
          .writeHead(403)
          .end('<Error><Code>AccessDenied</Code></Error>');
      res.end(
        `<ListMultipartUploadsResult><IsTruncated>${mode === 'truncated'}</IsTruncated>${sessions.has('owned') ? `<Upload><Key>${exactKey}</Key><UploadId>owned</UploadId></Upload>` : ''}<Upload><Key>${exactKey}-neighbor</Key><UploadId>neighbor</UploadId></Upload></ListMultipartUploadsResult>`,
      );
    } else if (req.method === 'DELETE') {
      expect(url.searchParams.get('uploadId')).toBe('owned');
      expect(saved.some((r) => r.uploadIds.includes('owned'))).toBe(true);
      if (mode === 'abort-fails')
        return void res
          .writeHead(500)
          .end('<Error><Code>InternalError</Code></Error>');
      sessions.delete('owned');
      res.writeHead(204).end();
    } else res.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port');
  try {
    const report = await runCreation(
      {
        service: 'fixture',
        endpoint: `http://127.0.0.1:${address.port}`,
        region: 'us-east-1',
        bucket: 'test',
        forcePathStyle: true,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test-secret' },
      },
      async (r) => {
        saved.push(structuredClone(r));
      },
    );
    expect(created).toBe(1);
    expect(report.status).toBe(mode === 'normal' ? 'observed' : 'failed');
    expect(report.productionReleasePermitted).toBe(false);
    expect(report.objectAbsent).toBe(true);
    if (mode === 'normal') {
      expect(report.providerStatus).toBe(200);
      expect(report.clientError?.name).toBe('InjectedResponseLoss');
      expect(report.uploadIds).toEqual(['owned']);
      expect(sessions.size).toBe(0);
      expect(report.sessionsAbsent).toBe(true);
    }
    expect(JSON.stringify(report)).not.toContain('test-secret');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

it('CLI 在服务拒绝 Create/List 时非零退出，HEAD404不掩盖失败', async () => {
  const server = createServer((req, res) => {
    res
      .writeHead(req.method === 'HEAD' ? 404 : 403)
      .end('<Error><Code>AccessDenied</Code></Error>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port');
  const directory = await mkdtemp(join(tmpdir(), 'creation-cli-'));
  try {
    const config = join(directory, 'config.json');
    const output = join(directory, 'output');
    await writeFile(
      config,
      JSON.stringify([
        {
          service: 'fixture',
          endpoint: `http://127.0.0.1:${address.port}`,
          region: 'us-east-1',
          bucket: 'test',
          forcePathStyle: true,
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
      ]),
    );
    await expect(
      promisify(execFile)(process.execPath, [
        'tests/experiments/upload-late-put/multipart-creation.ts',
        '--config',
        config,
        '--output',
        output,
      ]),
    ).rejects.toMatchObject({ code: 1 });
    const [run] = await readdir(output);
    expect(
      JSON.parse(await readFile(join(output, run, 'fixture.json'), 'utf8')),
    ).toMatchObject({
      status: 'failed',
      objectAbsent: true,
      sessionsAbsent: false,
      productionReleasePermitted: false,
    });
  } finally {
    server.closeAllConnections();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it('清理证据写盘失败仍关闭两个SDK客户端并向调用方报告失败', async () => {
  const destroy = vi.spyOn(S3Client.prototype, 'destroy');
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/xml');
    if (req.method === 'POST')
      res.end(
        '<InitiateMultipartUploadResult><UploadId>owned</UploadId></InitiateMultipartUploadResult>',
      );
    else
      res.end(
        '<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>',
      );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port');
  try {
    await expect(
      runCreation(
        {
          service: 'fixture',
          endpoint: `http://127.0.0.1:${address.port}`,
          region: 'us-east-1',
          bucket: 'test',
          forcePathStyle: true,
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
        async (report) => {
          if (report.events.some((event) => event.name === 'cleanup-discover'))
            throw new Error('disk full');
        },
      ),
    ).rejects.toThrow('disk full');
    expect(destroy).toHaveBeenCalledTimes(2);
  } finally {
    destroy.mockRestore();
    server.closeAllConnections();
    server.close();
  }
});
