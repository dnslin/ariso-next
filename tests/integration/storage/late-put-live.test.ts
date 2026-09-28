import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runLive } from '../../experiments/upload-late-put/live.ts';

// Real local sockets and clocks exercise orchestration, not provider guarantees.
it.each([false, true])(
  '跨期并发保存、等待发送结束和保留删除错误（注入失败=%s）',
  async (failDuringDelete) => {
    const objects = new Map<string, Buffer>();
    const active = new Set<string>();
    const completed = new Set<string>();
    let failedDelete = false;
    let cleanupBeforeOtherSenderEnded = false;
    const server = createServer(async (request, response) => {
      const url = new URL(request.url!, 'http://localhost');
      const key = url.pathname;
      if (request.method === 'DELETE') {
        if (active.has(key) && failDuringDelete && !failedDelete) {
          failedDelete = true;
          response.writeHead(500);
          response.end(
            '<Error><Code>InternalError</Code><Message>injected-delete-failure</Message></Error>',
          );
          return;
        }
        if (completed.has(key) && active.size > 0)
          cleanupBeforeOtherSenderEnded = true;
        objects.delete(key);
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method === 'HEAD' || request.method === 'GET') {
        const value = objects.get(key);
        response.writeHead(
          value ? 200 : 404,
          value ? { 'content-length': value.length, etag: '"fixture"' } : {},
        );
        response.end(request.method === 'GET' ? value : undefined);
        return;
      }
      const signedAt = url.searchParams.get('X-Amz-Date')!;
      const expiresAt =
        Date.parse(
          signedAt.replace(
            /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
            '$1-$2-$3T$4:$5:$6Z',
          ),
        ) +
        Number(url.searchParams.get('X-Amz-Expires')) * 1000;
      if (Date.now() > expiresAt) {
        response.writeHead(403);
        response.end('<Error><Code>AccessDenied</Code></Error>');
        return;
      }
      const late = Number(request.headers['content-length']) === 32 * 65536;
      if (late) active.add(key);
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        objects.set(key, Buffer.concat(chunks));
        response.end();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') throw error;
      } finally {
        if (late) {
          active.delete(key);
          completed.add(key);
        }
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    const directory = await mkdtemp(join(tmpdir(), 'late-put-live-'));
    try {
      const report = await runLive(
        {
          service: 'seaweedfs',
          endpoint: `http://127.0.0.1:${address.port}`,
          region: 'us-east-1',
          bucket: 'fixture',
          forcePathStyle: true,
          credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
        },
        directory,
        30,
      );
      expect(
        JSON.parse(await readFile(join(directory, 'report.json'), 'utf8')),
      ).toEqual(report);
      expect(report.releasePermitted).toBe(false);
      expect(active.size).toBe(0);
      expect(completed.size).toBe(2);
      expect(cleanupBeforeOtherSenderEnded).toBe(false);
      expect(objects.size).toBe(0);
      const late = report.observations.filter((o) =>
        o.name.startsWith('late-put:'),
      );
      expect(late).toHaveLength(2);
      for (const event of late) {
        const result = event.result as {
          crossed: boolean;
          expiresAt: string;
          result: {
            startedAt: string;
            bodyFinishedAt: string;
            bytesSent: number;
          };
        };
        expect(result.result.bytesSent).toBe(32 * 65536);
        expect(Date.parse(result.result.startedAt)).toBeLessThan(
          Date.parse(result.expiresAt),
        );
        expect(Date.parse(result.result.bodyFinishedAt)).toBeGreaterThan(
          Date.parse(result.expiresAt),
        );
        expect(result.crossed).toBe(true);
      }
      if (failDuringDelete) {
        expect(failedDelete).toBe(true);
        expect(report.status).toBe('failed');
        expect(JSON.stringify(report)).toContain('injected-delete-failure');
      } else expect(report.status).toBe('observed');
    } finally {
      server.closeAllConnections();
      server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  110_000,
);
