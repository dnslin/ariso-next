import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runCompletion } from '../../experiments/upload-late-put/multipart-completion.ts';

it.each([
  'normal',
  'complete-fails',
  'missing-session',
  'cleanup-fails',
  'corrupt-object',
  'completed-object-missing',
  'aborted-object-exists',
] as const)(
  'journals recovery and cleans exact keys (%s)',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'completion-'));
    const sessions = new Set<string>();
    const objects = new Set<string>();
    let creates = 0;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      const key = url.pathname;
      res.setHeader('content-type', 'application/xml');
      if (req.method === 'POST' && url.searchParams.has('uploads')) {
        const report = JSON.parse(
          await readFile(join(directory, 'report.json'), 'utf8'),
        );
        expect(
          report.cases.some((c: { key: string }) => key.endsWith(c.key)),
        ).toBe(true);
        sessions.add(key);
        creates++;
        res.end(
          '<InitiateMultipartUploadResult><UploadId>upload</UploadId></InitiateMultipartUploadResult>',
        );
      } else if (req.method === 'PUT') {
        req.resume();
        req.on('end', () => res.setHeader('ETag', '"part"').end());
      } else if (req.method === 'POST') {
        req.resume();
        req.on('end', () => {
          if (mode === 'missing-session' && creates === 2)
            res.writeHead(404).end('<Error><Code>NoSuchUpload</Code></Error>');
          else if (mode === 'complete-fails')
            res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
          else if (!sessions.delete(key))
            res.writeHead(404).end('<Error><Code>NoSuchUpload</Code></Error>');
          else {
            if (!(mode === 'completed-object-missing' && creates === 2))
              objects.add(key);
            res.end(
              '<CompleteMultipartUploadResult><ETag>"complete"</ETag></CompleteMultipartUploadResult>',
            );
          }
        });
      } else if (req.method === 'DELETE') {
        if (!url.searchParams.has('uploadId') && mode === 'cleanup-fails')
          res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
        else if (url.searchParams.has('uploadId') && !sessions.delete(key))
          res.writeHead(404).end('<Error><Code>NoSuchUpload</Code></Error>');
        else {
          if (!url.searchParams.has('uploadId')) objects.delete(key);
          else if (mode === 'aborted-object-exists' && creates === 3)
            objects.add(key);
          res.writeHead(204).end();
        }
      } else if (url.searchParams.has('uploadId')) {
        if (sessions.has(key))
          res.end(
            '<ListPartsResult><Part><PartNumber>1</PartNumber></Part></ListPartsResult>',
          );
        else res.writeHead(404).end('<Error><Code>NoSuchUpload</Code></Error>');
      } else if (!objects.has(key)) res.writeHead(404).end();
      else {
        res.setHeader('content-length', 65536);
        res.end(
          req.method === 'HEAD'
            ? undefined
            : Buffer.alloc(65536, mode === 'corrupt-object' ? 0x62 : 0x61),
        );
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('port');
    try {
      const report = await runCompletion(
        {
          service: 'fixture',
          endpoint: `http://127.0.0.1:${address.port}`,
          region: 'us-east-1',
          bucket: 'test',
          forcePathStyle: true,
          credentials: {
            accessKeyId: 'test',
            secretAccessKey: 'secret-not-in-report',
          },
        },
        directory,
        0,
      );
      expect(creates).toBe(6);
      expect(report.status).toBe(mode === 'normal' ? 'observed' : 'failed');
      expect(report.cases.every((c) => c.objectAbsent)).toBe(
        mode !== 'cleanup-fails',
      );
      expect(objects.size === 0).toBe(mode !== 'cleanup-fails');
      expect(report.productionReleasePermitted).toBe(false);
      expect(JSON.stringify(report)).not.toContain('secret-not-in-report');
      if (mode === 'normal') {
        const lost = report.cases[0];
        expect(
          lost.events.find((e) => e.name === 'complete')?.error,
        ).toMatchObject({ name: 'InjectedResponseLoss' });
        expect(lost.recovery).toMatchObject({
          exists: true,
          contentMatches: true,
        });
        expect(lost.recovery?.pid).not.toBe(process.pid);
      }
    } finally {
      server.closeAllConnections();
      server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  20000,
);
