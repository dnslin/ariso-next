import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  stat,
  truncate,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

const CHUNK = 8 * 1024 * 1024;
const DEADLINE = 1500;
const outputDirectory = dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'ariso-chunk-experiment-'));
const results = [];

class Receiver {
  offset = 0;
  total;
  resetting = false;
  active = null;
  events = [];
  beforeWrite;
  constructor(directory, total) {
    this.directory = directory;
    this.total = total;
    this.part = join(directory, 'source.part');
    this.complete = join(directory, 'source.complete');
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true });
    const handle = await open(this.part, 'w');
    await handle.close();
  }
  async receive(request, response) {
    const start = Number(request.headers['upload-offset']);
    const total = Number(request.headers['upload-length']);
    if (
      this.resetting ||
      this.active ||
      start !== this.offset ||
      total !== this.total ||
      this.offset === this.total
    ) {
      response.writeHead(409).end(JSON.stringify({ offset: this.offset }));
      request.resume();
      return;
    }
    let finish;
    const done = new Promise((resolve) => {
      finish = resolve;
    });
    this.active = { request, done };
    const expected = Math.min(CHUNK, total - start);
    const handle = await open(this.part, 'r+');
    let received = 0;
    try {
      for await (const data of request) {
        await this.beforeWrite?.();
        if (received + data.length > expected)
          throw new Error('BLOCK_TOO_LARGE');
        let written = 0;
        while (written < data.length) {
          const result = await handle.write(
            data,
            written,
            data.length - written,
            start + received + written,
          );
          if (result.bytesWritten <= 0)
            throw new Error('FILE_WRITE_MADE_NO_PROGRESS');
          written += result.bytesWritten;
        }
        received += data.length;
      }
      if (received !== expected) throw new Error('SHORT_BLOCK');
      await handle.sync();
      await handle.close();
      this.offset += received;
      if (this.offset === this.total) {
        await rename(this.part, this.complete);
        const directory = await open(this.directory, 'r');
        await directory.sync();
        await directory.close();
      }
      this.events.push('block-accepted');
      response.writeHead(200).end(
        JSON.stringify({
          offset: this.offset,
          received: this.offset === this.total,
        }),
      );
    } catch (error) {
      await handle.close();
      await truncate(this.part, start);
      this.events.push('writer-stopped');
      if (!response.destroyed && !response.writableEnded)
        response
          .writeHead(400)
          .end(JSON.stringify({ code: error.message, offset: this.offset }));
    } finally {
      this.active = null;
      finish();
    }
  }
  async reset(response) {
    if (this.offset === this.total) {
      response.writeHead(409).end();
      return;
    }
    this.resetting = true;
    this.events.push('reset-start');
    const active = this.active;
    if (active) {
      active.request.destroy(new Error('RESET_REQUESTED'));
      await active.done;
    }
    await truncate(this.part, 0);
    this.events.push('reset-truncate');
    this.offset = 0;
    this.resetting = false;
    this.events.push('reset-open');
    response.writeHead(200).end(JSON.stringify({ offset: 0 }));
  }
}

async function scenario(name, total, action) {
  const started = performance.now();
  const receiver = new Receiver(
    join(temporary, name.replaceAll(' ', '-')),
    total,
  );
  await receiver.initialize();
  const server = http.createServer(
    {
      requestTimeout: DEADLINE,
      headersTimeout: DEADLINE,
      connectionsCheckingInterval: 20,
    },
    (request, response) => {
      if (request.url === '/whole') {
        void (async () => {
          try {
            for await (const data of request) void data;
            response.writeHead(200).end();
          } catch {
            receiver.events.push('whole-request-aborted');
          }
        })();
      } else {
        const operation =
          request.method === 'DELETE'
            ? receiver.reset(response)
            : receiver.receive(request, response);
        void operation.catch((error) => {
          receiver.events.push(`UNEXPECTED:${error.message}`);
          if (!response.destroyed && !response.writableEnded)
            response.writeHead(500).end();
        });
      }
    },
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const detail = await action(receiver, url);
    assert(
      !receiver.events.some((item) => item.startsWith('UNEXPECTED:')),
      receiver.events.join(','),
    );
    results.push({
      name,
      passed: true,
      durationMs: Math.round(performance.now() - started),
      ...detail,
    });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      error: error.stack,
      events: receiver.events,
    });
    process.stdout.write(`FAIL ${name}: ${error.message}\n`);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}

async function send(
  url,
  {
    size = 0,
    total = size,
    offset = 0,
    slow = false,
    method = 'PUT',
    byte = 7,
    path = '/file',
  } = {},
) {
  let request;
  const response = new Promise((resolve, reject) => {
    request = http.request(
      url + path,
      {
        method,
        headers: {
          'Content-Length': size,
          'Upload-Offset': offset,
          'Upload-Length': total,
        },
      },
      (incoming) => {
        let body = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (data) => {
          body += data;
        });
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode,
            body: body ? JSON.parse(body) : null,
          }),
        );
        incoming.on('error', reject);
      },
    );
    request.on('error', reject);
  });
  const sending = (async () => {
    for (let count = 0; count < size;) {
      const length = Math.min(64 * 1024, size - count);
      await new Promise((resolve, reject) =>
        request.write(Buffer.alloc(length, byte), (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      count += length;
      if (slow) await delay(4);
    }
    request.end();
  })();
  const deadline = setTimeout(
    () => request.destroy(new Error('CLIENT_TEST_DEADLINE')),
    12000,
  );
  const outcomes = await Promise.allSettled([response, sending]);
  clearTimeout(deadline);
  if (outcomes[0].status === 'fulfilled') return outcomes[0].value;
  throw outcomes[0].reason;
}

async function waitFor(predicate, timeout = 5000) {
  const until = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > until) throw new Error('Condition deadline');
    await delay(5);
  }
}

try {
  await scenario(
    'sequential 8MiB blocks and last tail',
    CHUNK * 2 + 17,
    async (receiver, url) => {
      for (const [offset, size, byte] of [
        [0, CHUNK, 11],
        [CHUNK, CHUNK, 13],
        [CHUNK * 2, 17, 19],
      ]) {
        const result = await send(url, {
          offset,
          size,
          total: receiver.total,
          byte,
        });
        assert.equal(result.status, 200);
        assert.equal(result.body.offset, offset + size);
        if (offset + size < receiver.total)
          assert(!existsSync(receiver.complete));
      }
      const expected = createHash('sha256')
        .update(Buffer.alloc(CHUNK, 11))
        .update(Buffer.alloc(CHUNK, 13))
        .update(Buffer.alloc(17, 19))
        .digest('hex');
      assert.equal(
        createHash('sha256')
          .update(readFileSync(receiver.complete))
          .digest('hex'),
        expected,
      );
      assert(!existsSync(receiver.part));
      return { bytes: receiver.total, blockSize: CHUNK };
    },
  );

  await scenario(
    'duplicate out of order and short block preserve accepted prefix',
    CHUNK * 2,
    async (receiver, url) => {
      assert.equal(
        (await send(url, { size: CHUNK, total: receiver.total, byte: 21 }))
          .status,
        200,
      );
      const prefix = readFileSync(receiver.part);
      assert.equal(
        (await send(url, { size: 1, total: receiver.total, offset: 0 })).status,
        409,
      );
      assert.equal(
        (await send(url, { size: 1, total: receiver.total, offset: CHUNK + 1 }))
          .status,
        409,
      );
      const short = await send(url, {
        size: 1024,
        total: receiver.total,
        offset: CHUNK,
      });
      assert.equal(short.status, 400);
      assert.equal(short.body.code, 'SHORT_BLOCK');
      assert.equal(receiver.offset, CHUNK);
      assert.deepEqual(readFileSync(receiver.part), prefix);
    },
  );

  await scenario(
    'reset waits for old writer before truncating',
    CHUNK * 2,
    async (receiver, url) => {
      let release;
      let blocked = false;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      receiver.beforeWrite = async () => {
        if (!blocked) {
          blocked = true;
          await gate;
        }
      };
      const oldUpload = send(url, {
        size: CHUNK,
        total: receiver.total,
        slow: true,
      }).then(
        (value) => ({ value }),
        (error) => ({ error: error.code ?? error.message }),
      );
      await waitFor(() => blocked);
      const resetting = send(url, { method: 'DELETE' });
      await waitFor(() => receiver.resetting);
      await delay(40);
      assert(
        !receiver.events.includes('reset-truncate'),
        'Reset must wait for writer',
      );
      const blockedNew = await send(url, { size: 1, total: receiver.total });
      assert.equal(blockedNew.status, 409);
      release();
      const [oldResult, resetResult] = await Promise.all([
        oldUpload,
        resetting,
      ]);
      assert.equal(resetResult.status, 200);
      assert(oldResult.error || oldResult.value.status >= 400);
      assert(
        receiver.events.indexOf('writer-stopped') <
          receiver.events.indexOf('reset-truncate'),
      );
      assert.equal((await stat(receiver.part)).size, 0);
      assert.equal(receiver.offset, 0);
      receiver.beforeWrite = undefined;
      assert.equal(
        (await send(url, { size: CHUNK, total: receiver.total, byte: 33 }))
          .status,
        200,
      );
      assert.equal((await stat(receiver.part)).size, CHUNK);
    },
  );

  await scenario(
    'aggregate transfer exceeds single request deadline',
    CHUNK * 4,
    async (receiver, url) => {
      const started = performance.now();
      const durations = [];
      for (let offset = 0; offset < receiver.total; offset += CHUNK) {
        const start = performance.now();
        const response = await send(url, {
          size: CHUNK,
          total: receiver.total,
          offset,
          slow: true,
        });
        durations.push(Math.round(performance.now() - start));
        assert.equal(response.status, 200);
      }
      const elapsedMs = Math.round(performance.now() - started);
      assert(elapsedMs > DEADLINE);
      assert(durations.every((duration) => duration < DEADLINE));
      assert.equal((await stat(receiver.complete)).size, receiver.total);
      return {
        requestDeadlineMs: DEADLINE,
        requestDurationsMs: durations,
        totalDurationMs: elapsedMs,
        bytes: receiver.total,
      };
    },
  );

  await scenario(
    'negative whole file request hits actual Node request deadline',
    CHUNK * 4,
    async (receiver, url) => {
      const started = performance.now();
      let outcome;
      try {
        outcome = await send(url, {
          size: CHUNK * 4,
          slow: true,
          path: '/whole',
        });
      } catch (error) {
        outcome = { error: error.code ?? error.message };
      }
      const elapsedMs = Math.round(performance.now() - started);
      await waitFor(() => receiver.events.includes('whole-request-aborted'));
      assert(outcome.status === 408 || outcome.error === 'ECONNRESET');
      assert(elapsedMs >= DEADLINE - 50);
      return { outcome, requestDeadlineMs: DEADLINE, elapsedMs };
    },
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

const report = {
  scope: 'Isolated HTTP chunk receiver model; not integrated restore API',
  node: process.version,
  platform: process.platform,
  actualBlockBytes: CHUNK,
  simulatedRequestDeadlineMs: DEADLINE,
  productionRequestDeadlineMs: 1860000,
  real31MinuteTransferTested: false,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  temporaryResourcesRemoved: !existsSync(temporary),
  results,
};
writeFileSync(
  join(outputDirectory, 'chunks-report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    passed: report.passed,
    failed: report.failed,
    temporaryResourcesRemoved: report.temporaryResourcesRemoved,
  }) + '\n',
);
if (report.failed) process.exitCode = 1;
