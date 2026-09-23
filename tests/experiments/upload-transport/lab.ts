// Isolated engineering experiment, not an application upload route or media worker.
import { createServer, request, type Server } from 'node:http';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';

export const proposedBudgets = {
  idleMs: 120_000,
  totalMs: 1_800_000,
  waitMs: 900_000,
};
type Options = Partial<typeof proposedBudgets> & { maxBytes?: number };
type Reception = { bytes: number; code: string; elapsedMs: number };
async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing TCP address');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  const done = new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  server.closeAllConnections();
  await done;
}

export async function createTransportLab(options: Options = {}) {
  const budgets = { ...proposedBudgets, ...options };
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
  const directory = await mkdtemp(join(tmpdir(), 'ariso-upload-transport-'));
  const receptions: Reception[] = [];
  const active = new Set<Promise<void>>();
  const waiting = new Set<ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  const job: { status: 'processing' | 'ready' | 'failed' } = {
    status: 'processing',
  };
  let sequence = 0;
  let waitStarted: () => void;
  const waitingStarted = new Promise<void>((resolve) => {
    waitStarted = resolve;
  });
  const upstream = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>上传传输实验</title></head><body><h1>上传传输实验</h1><p>独立 Node HTTP 代理与磁盘接收实验，不是业务上传页面。</p><script>window.uploadLabLimits = ${JSON.stringify({ maxBytes, ...budgets })};</script></body></html>`,
      );
      return;
    }
    if (req.url === '/wait') {
      waitStarted();
      const finish = () => {
        // Final read is deliberately after the wait expires, and never mutates the job.
        const status = job.status;
        res.writeHead(
          status === 'ready' ? 201 : status === 'failed' ? 422 : 504,
          { 'content-type': 'application/json' },
        );
        res.end(
          JSON.stringify({
            imageId: 'image-one',
            status,
            ...(status === 'processing' ? { code: 'UPLOAD_WAIT_TIMEOUT' } : {}),
          }),
        );
      };
      if (job.status !== 'processing') {
        finish();
        return;
      }
      const timer = setTimeout(() => {
        waiting.delete(timer);
        finish();
      }, budgets.waitMs);
      waiting.add(timer);
      res.on('close', () => {
        clearTimeout(timer);
        waiting.delete(timer);
      });
      return;
    }
    const started = performance.now();
    const temporary = join(directory, `partial-${++sequence}`);
    const file = createWriteStream(temporary, { flags: 'wx' });
    let bytes = 0;
    let settled = false;
    let resolveCompletion: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    active.add(completion);
    const finish = async (code: string, status: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      clearTimeout(total);
      req.unpipe(counter);
      counter.unpipe(file);
      if (!file.closed) {
        const closed = new Promise<void>((resolve) =>
          file.once('close', resolve),
        );
        file.destroy();
        await closed;
      }
      try {
        if (status === 201)
          await rename(temporary, join(directory, 'original'));
        else await rm(temporary, { force: true });
      } catch (error) {
        code = `UPLOAD_FILE_ERROR: ${String(error)}`;
        status = 500;
      }
      receptions.push({ code, bytes, elapsedMs: performance.now() - started });
      for (const listener of listeners) listener();
      if (!res.destroyed) {
        res.writeHead(status, {
          'content-type': 'application/json',
          connection: 'close',
        });
        res.end(JSON.stringify({ code, bytes }));
      }
      active.delete(completion);
      resolveCompletion();
    };
    const idle = setTimeout(
      () => void finish('UPLOAD_IDLE_TIMEOUT', 408),
      budgets.idleMs,
    );
    const total = setTimeout(
      () => void finish('UPLOAD_TOTAL_TIMEOUT', 408),
      budgets.totalMs,
    );
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        idle.refresh();
        if (bytes > maxBytes) {
          void finish('UPLOAD_TOO_LARGE', 413);
          callback();
        } else callback(null, chunk);
      },
    });
    req.on('aborted', () => void finish('UPLOAD_DISCONNECTED', 400));
    req.on(
      'error',
      (error) => void finish(`UPLOAD_DISCONNECTED: ${error.message}`, 400),
    );
    file.on(
      'error',
      (error) => void finish(`UPLOAD_FILE_ERROR: ${error.message}`, 500),
    );
    file.on(
      'finish',
      () =>
        void finish(
          bytes === 0 ? 'UPLOAD_EMPTY' : 'RECEIVED',
          bytes === 0 ? 400 : 201,
        ),
    );
    const declared = req.headers['content-length'];
    if (declared !== undefined && Number(declared) > maxBytes)
      void finish('UPLOAD_TOO_LARGE', 413);
    else req.pipe(counter).pipe(file);
  });
  upstream.requestTimeout = 0;
  upstream.timeout = 0;
  const upstreamUrl = await listen(upstream);
  // Real streaming proxy: no buffering, no default timeout shorter than the experiment.
  const proxy = createServer((req, res) => {
    const outgoing = request(
      `${upstreamUrl}${req.url}`,
      { method: req.method, headers: req.headers },
      (incoming) => {
        res.writeHead(incoming.statusCode ?? 502, incoming.headers);
        incoming.pipe(res);
        incoming.on('error', (error) => res.destroy(error));
      },
    );
    outgoing.on('error', (error) => {
      if (!res.headersSent) res.writeHead(502);
      if (!res.destroyed)
        res.end(
          JSON.stringify({
            code: 'PROXY_UPSTREAM_ERROR',
            message: error.message,
          }),
        );
    });
    req.on('aborted', () => outgoing.destroy());
    res.on('close', () => {
      if (!res.writableFinished) outgoing.destroy();
    });
    req.pipe(outgoing);
  });
  proxy.requestTimeout = 0;
  proxy.timeout = 0;
  const url = await listen(proxy);
  return {
    url,
    directory,
    receptions,
    job,
    waitingStarted,
    nextReception: (afterCount = 0) =>
      new Promise<void>((resolve) => {
        const completed = () => {
          if (receptions.length > afterCount) {
            listeners.delete(completed);
            resolve();
          }
        };
        listeners.add(completed);
        completed();
      }),
    async close() {
      for (const timer of waiting) clearTimeout(timer);
      await close(proxy);
      await close(upstream);
      await Promise.all(active);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export function sendBody(
  url: string,
  options: {
    bytes: number;
    declared?: number;
    chunkBytes?: number;
    intervalMs?: number;
    disconnectAfterBytes?: number;
  },
) {
  const started = performance.now();
  return new Promise<{
    status: number;
    body: { code?: string; bytes?: number };
    elapsedMs: number;
  }>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = 0;
    let disconnected = false;
    const req = request(
      url,
      {
        method: 'POST',
        headers:
          options.declared === undefined
            ? {}
            : { 'content-length': options.declared },
      },
      (res) => {
        clearTimeout(timer);
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          req.destroy();
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString()),
              elapsedMs: performance.now() - started,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', (error) => {
      clearTimeout(timer);
      if (disconnected)
        resolve({
          status: 0,
          body: { code: 'CLIENT_DISCONNECTED' },
          elapsedMs: performance.now() - started,
        });
      else reject(error);
    });
    function write() {
      if (req.destroyed) return;
      if (
        options.disconnectAfterBytes !== undefined &&
        sent >= options.disconnectAfterBytes
      ) {
        disconnected = true;
        req.destroy(new Error('Deliberate client disconnect'));
        return;
      }
      if (sent === options.bytes) {
        req.end();
        return;
      }
      const count = Math.min(
        options.chunkBytes ?? 64 * 1024,
        options.bytes - sent,
      );
      sent += count;
      const accepted = req.write(Buffer.alloc(count, 42));
      const next = () => {
        timer = setTimeout(write, options.intervalMs ?? 0);
      };
      if (accepted) next();
      else req.once('drain', next);
    }
    write();
  });
}
