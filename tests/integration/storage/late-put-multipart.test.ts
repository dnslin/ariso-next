import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import {
  runMultipart,
  type MultipartReport,
} from '../../experiments/upload-late-put/multipart.ts';

it.each([
  'normal',
  'first-part-fails',
  'cleanup-fails',
  'request-timeout',
] as const)(
  '保留会话和失败证据，Abort后尝试旧请求且最终清理（场景=%s）',
  async (mode) => {
    const failFirst = mode === 'first-part-fails';
    const saved: MultipartReport[] = [];
    let aborted = false;
    let deleted = false;
    let bodyEndedAfterAbort = false;
    const server = createServer((request, response) => {
      const url = new URL(request.url!, 'http://localhost');
      response.setHeader('content-type', 'application/xml');
      if (request.method === 'POST' && url.searchParams.has('uploads')) {
        if (mode === 'request-timeout') return;
        expect(saved[0].key).toMatch(/^upload-v01\/multipart\//);
        response.end(
          '<InitiateMultipartUploadResult><UploadId>session-1</UploadId></InitiateMultipartUploadResult>',
        );
      } else if (request.method === 'PUT') {
        expect(saved.some((r) => r.uploadId === 'session-1')).toBe(true);
        request.resume();
        request.on('end', () => {
          if (url.searchParams.get('partNumber') === '2' && aborted)
            bodyEndedAfterAbort = true;
          if (failFirst || aborted) {
            response.statusCode = failFirst ? 500 : 404;
            response.end(
              `<Error><Code>${failFirst ? 'InternalError' : 'NoSuchUpload'}</Code><Message>diagnostic failure</Message></Error>`,
            );
          } else {
            response.setHeader('ETag', '"part-one"');
            response.end();
          }
        });
      } else if (request.method === 'DELETE') {
        if (!url.searchParams.has('uploadId') && mode === 'cleanup-fails') {
          response
            .writeHead(500)
            .end('<Error><Code>InternalError</Code></Error>');
          return;
        }
        if (url.searchParams.has('uploadId')) aborted = true;
        else deleted = true;
        response.statusCode = 204;
        response.end();
      } else if (request.method === 'HEAD' || aborted) {
        response.statusCode = 404;
        response.end('<Error><Code>NoSuchUpload</Code></Error>');
      } else
        response.end(
          '<ListPartsResult><Part><PartNumber>1</PartNumber><ETag>"part-one"</ETag><Size>5242880</Size></Part></ListPartsResult>',
        );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected port');
    try {
      const report = await runMultipart(
        {
          service: 'local',
          endpoint: `http://127.0.0.1:${address.port}`,
          region: 'us-east-1',
          bucket: 'test',
          forcePathStyle: true,
          credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        },
        async (r) => {
          saved.push(structuredClone(r));
        },
        {
          intervalMs: 5,
          abortDelayMs: 15,
          spacingMs: 0,
          requestTimeoutMs: 100,
        },
      );
      expect(deleted).toBe(mode !== 'cleanup-fails');
      expect(report.status).toBe(mode === 'normal' ? 'observed' : 'failed');
      expect(report.objectAbsent).toBe(true);
      expect(report.backendPartsReclaimed).toBe('unverified');
      if (mode === 'request-timeout') {
        expect(
          report.events.find((e) => e.name === 'create')?.error,
        ).toMatchObject({ name: 'TimeoutError' });
      } else if (failFirst)
        expect(
          report.events.find((e) => e.name === 'upload-part-1')?.error,
        ).toMatchObject({ name: 'InternalError', httpStatusCode: 500 });
      else {
        expect(bodyEndedAfterAbort).toBe(true);
        expect(
          report.events.find((e) => e.name === 'replay-old-part-url')?.result,
        ).toMatchObject({ status: 404, code: 'NoSuchUpload' });
        expect(
          report.events.find((e) => e.name === 'complete-aborted-session')
            ?.error,
        ).toBeDefined();
      }
      expect(JSON.stringify(report)).not.toContain('X-Amz-Signature');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  },
);

it('CLI exits nonzero when creating a session fails even if final object cleanup succeeds', async () => {
  const server = createServer((request, response) => {
    if (request.method === 'POST')
      response.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
    else response.writeHead(request.method === 'HEAD' ? 404 : 204).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected port');
  const directory = await mkdtemp(join(tmpdir(), 'multipart-failure-'));
  try {
    const configPath = join(directory, 'config.json');
    const output = join(directory, 'output');
    await writeFile(
      configPath,
      JSON.stringify([
        {
          service: 'fixture',
          endpoint: `http://127.0.0.1:${address.port}`,
          region: 'us-east-1',
          bucket: 'fixture',
          forcePathStyle: true,
          credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
        },
      ]),
    );
    await expect(
      promisify(execFile)(process.execPath, [
        'tests/experiments/upload-late-put/multipart.ts',
        '--config',
        configPath,
        '--output',
        output,
      ]),
    ).rejects.toMatchObject({ code: 1 });
    const [run] = await readdir(output);
    const report = JSON.parse(
      await readFile(join(output, run, 'fixture.json'), 'utf8'),
    );
    expect(report).toMatchObject({
      status: 'failed',
      objectAbsent: true,
      backendPartsReclaimed: 'unverified',
    });
  } finally {
    server.closeAllConnections();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
