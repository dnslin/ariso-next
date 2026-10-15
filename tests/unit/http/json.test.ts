import { expect, it } from 'vitest';
import {
  JsonBodyTooLargeError,
  readBoundedJson,
} from '../../../src/server/http/json.ts';

const limit = 256 * 1024;

function streamed(chunks: Uint8Array[], length?: string) {
  let reads = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (reads < chunks.length) controller.enqueue(chunks[reads++]);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: length ? { 'content-length': length } : {},
    body,
    duplex: 'half',
  } as RequestInit);
  return { request, body, reads: () => reads, cancelled: () => cancelled };
}

it.each([undefined, '1', String(limit * 2)])(
  'accepts a JSON document exactly at the byte limit with Content-Length %s',
  async (length) => {
    const expected = 'x'.repeat(limit - 2);
    const bytes = new TextEncoder().encode(JSON.stringify(expected));
    const input = streamed(
      [bytes.subarray(0, 101), bytes.subarray(101)],
      length,
    );
    expect(await readBoundedJson(input.request)).toBe(expected);
    expect(input.body.locked).toBe(false);
    expect(input.cancelled()).toBe(false);
  },
);

it.each([undefined, '1'])(
  'cancels immediately after received bytes exceed the limit with Content-Length %s',
  async (length) => {
    const input = streamed(
      [new Uint8Array(limit), new Uint8Array(1), new Uint8Array(limit)],
      length,
    );
    await expect(readBoundedJson(input.request)).rejects.toBeInstanceOf(
      JsonBodyTooLargeError,
    );
    expect(input.reads()).toBe(2);
    expect(input.cancelled()).toBe(true);
    expect(input.body.locked).toBe(false);
  },
);

it('counts multibyte UTF-8 and decodes characters split between chunks', async () => {
  const value = '😀'.repeat((limit - 4) / 4) + '中';
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  expect(value.length).toBeLessThan(limit);
  expect(bytes.byteLength).toBe(limit + 1);
  await expect(
    readBoundedJson(streamed([bytes]).request),
  ).rejects.toBeInstanceOf(JsonBodyTooLargeError);
  const accepted = new TextEncoder().encode(JSON.stringify(value.slice(0, -1)));
  const input = streamed([
    accepted.subarray(0, 3),
    accepted.subarray(3, 9),
    accepted.subarray(9),
  ]);
  expect(await readBoundedJson(input.request)).toBe(value.slice(0, -1));
});

it('preserves JSON parsing and stream errors and releases the reader', async () => {
  const malformed = streamed([new TextEncoder().encode('{')]);
  await expect(readBoundedJson(malformed.request)).rejects.toBeInstanceOf(
    SyntaxError,
  );
  expect(malformed.body.locked).toBe(false);
  await expect(
    readBoundedJson(new Request('http://localhost', { method: 'POST' })),
  ).rejects.toBeInstanceOf(SyntaxError);
  const failure = new Error('connection interrupted');
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(failure);
    },
  });
  const request = new Request('http://localhost', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  await expect(readBoundedJson(request)).rejects.toBe(failure);
  expect(body.locked).toBe(false);
});

it('accepts a leading UTF-8 BOM like Request.json()', async () => {
  const input = streamed([new TextEncoder().encode('\uFEFF{"value":"中"}')]);
  expect(await readBoundedJson(input.request)).toEqual({ value: '中' });
});
