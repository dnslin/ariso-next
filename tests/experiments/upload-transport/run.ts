import assert from 'node:assert/strict';
import { get } from 'node:http';
import { readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createTransportLab, proposedBudgets, sendBody } from './lab.ts';

const mode = process.argv[2] ?? '--smoke';
if (!['--smoke', '--real-time'].includes(mode))
  throw new Error('Usage: run.ts [--smoke|--real-time]');
const realTime = mode === '--real-time';
const budgets = realTime
  ? proposedBudgets
  : { idleMs: 120, totalMs: 1800, waitMs: 900 };
const startedAt = new Date().toISOString();
function checkpoint<T>(result: T): T {
  console.error(
    JSON.stringify({ checkpointAt: new Date().toISOString(), result }),
  );
  return result;
}
const results = await Promise.all([
  (async () => {
    const lab = await createTransportLab(budgets);
    try {
      const result = await sendBody(lab.url, {
        bytes: 2,
        chunkBytes: 1,
        intervalMs: budgets.idleMs * 2,
      });
      assert.equal(result.body.code, 'UPLOAD_IDLE_TIMEOUT');
      assert.equal(result.status, 408);
      assert(result.elapsedMs >= budgets.idleMs);
      assert.deepEqual(await readdir(lab.directory), []);
      return checkpoint({
        scenario: 'idle',
        ...result,
        reception: lab.receptions[0],
        partialRemoved: true,
      });
    } finally {
      await lab.close();
    }
  })(),
  (async () => {
    const lab = await createTransportLab(budgets);
    try {
      const result = await sendBody(lab.url, {
        bytes: 1000,
        chunkBytes: 1,
        intervalMs: Math.floor(budgets.idleMs / 4),
      });
      assert.equal(result.body.code, 'UPLOAD_TOTAL_TIMEOUT');
      assert.equal(result.status, 408);
      assert(result.elapsedMs >= budgets.totalMs);
      assert.deepEqual(await readdir(lab.directory), []);
      return checkpoint({
        scenario: 'total-with-progress',
        ...result,
        reception: lab.receptions[0],
        partialRemoved: true,
      });
    } finally {
      await lab.close();
    }
  })(),
  (async () => {
    const lab = await createTransportLab(budgets);
    try {
      const started = performance.now();
      // node:http has no implicit 300s response-header deadline (unlike fetch).
      const response = await new Promise<{
        status: number;
        body: { code: string; status: string };
      }>((resolve, reject) => {
        const request = get(`${lab.url}/wait`, (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('error', reject);
          incoming.on('end', () => {
            try {
              resolve({
                status: incoming.statusCode ?? 0,
                body: JSON.parse(Buffer.concat(chunks).toString()),
              });
            } catch (error) {
              reject(error);
            }
          });
        });
        request.on('error', reject);
      });
      const body = response.body;
      const elapsedMs = performance.now() - started;
      assert.equal(response.status, 504);
      assert.equal(body.code, 'UPLOAD_WAIT_TIMEOUT');
      assert.equal(lab.job.status, 'processing');
      assert(elapsedMs >= budgets.waitMs);
      return checkpoint({
        scenario: 'api-wait',
        status: response.status,
        body,
        elapsedMs,
        jobAfterTimeout: lab.job.status,
      });
    } finally {
      await lab.close();
    }
  })(),
]);
console.log(
  JSON.stringify(
    {
      startedAt,
      completedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      mode,
      budgets,
      scope:
        'Isolated Node HTTP streaming reverse proxy and in-memory job fixture; not production Next/media or deployment proxy acceptance.',
      results,
    },
    null,
    2,
  ),
);
