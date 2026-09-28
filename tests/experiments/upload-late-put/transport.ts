import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
} from 'node:http';
import { request as httpsRequest } from 'node:https';

export type PutOptions = {
  bytes: number;
  chunkBytes: number;
  intervalMs: number;
  abortAfterBytes?: number;
  timeoutMs: number;
  headers?: Record<string, string>;
};

export type PutResult = {
  startedAt: string;
  finishedAt: string;
  // The request stream finished flushing its entire body; not provider acknowledgement.
  bodyFinishedAt?: string;
  // Successful write callbacks count bytes handed to the client socket, not provider acknowledgement.
  bytesSent: number;
  status?: number;
  code?: string;
  requestId?: string;
  error?: { name: string; message: string };
  outcome: 'response' | 'aborted' | 'error';
};

export async function put(
  url: string,
  options: PutOptions,
): Promise<PutResult> {
  const startedAt = new Date().toISOString();
  return new Promise((resolve) => {
    let request: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    let nextChunk: NodeJS.Timeout | undefined;
    let deadline: NodeJS.Timeout | undefined;
    let bytesSent = 0;
    let bodyFinishedAt: string | undefined;
    let settled = false;

    function finish(
      result: Omit<
        PutResult,
        'startedAt' | 'finishedAt' | 'bodyFinishedAt' | 'bytesSent'
      >,
    ) {
      if (settled) return;
      settled = true;
      clearTimeout(nextChunk);
      clearTimeout(deadline);
      response?.destroy();
      request?.destroy();
      resolve({
        startedAt,
        finishedAt: new Date().toISOString(),
        bytesSent,
        bodyFinishedAt,
        ...result,
      });
    }

    function fail(error: Error & { code?: string }) {
      finish({
        outcome: 'error',
        status: response?.statusCode,
        code: error.code,
        error: {
          name: error.name,
          message: error.message.replaceAll(url, '[signed URL]'),
        },
      });
    }

    function sendChunk() {
      if (settled || response || !request) return;
      const target = Math.min(
        options.bytes,
        options.abortAfterBytes ?? options.bytes,
      );
      if (bytesSent === target) {
        if (options.abortAfterBytes !== undefined && target < options.bytes) {
          finish({ outcome: 'aborted' });
        } else {
          request.end(() => {
            if (!settled && request?.writableFinished) {
              bodyFinishedAt = new Date().toISOString();
            }
          });
        }
        return;
      }
      const length = Math.min(options.chunkBytes, target - bytesSent);
      // Keep only one write outstanding: the callback waits for the socket to
      // consume the chunk, including when write() reports backpressure.
      request.write(Buffer.alloc(length, 0x61), (error) => {
        if (settled) return;
        if (error) {
          fail(error);
          return;
        }
        bytesSent += length;
        if (response) return;
        if (bytesSent === target) sendChunk();
        else nextChunk = setTimeout(sendChunk, options.intervalMs);
      });
    }

    try {
      for (const [name, value] of Object.entries({
        bytes: options.bytes,
        chunkBytes: options.chunkBytes,
        timeoutMs: options.timeoutMs,
      })) {
        if (!Number.isSafeInteger(value) || value <= 0)
          throw new Error(`${name} must be a positive integer`);
      }
      for (const [name, value] of Object.entries({
        intervalMs: options.intervalMs,
        abortAfterBytes: options.abortAfterBytes ?? 0,
      })) {
        if (!Number.isSafeInteger(value) || value < 0)
          throw new Error(`${name} must be a nonnegative integer`);
      }
      const target = new URL(url);
      if (target.protocol !== 'https:' && target.protocol !== 'http:')
        throw new Error('PUT requires an HTTP or HTTPS URL');
      request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
        target,
        {
          method: 'PUT',
          agent: false,
          headers: {
            'content-type': 'application/octet-stream',
            ...options.headers,
            'content-length': String(options.bytes),
          },
        },
        (incoming) => {
          response = incoming;
          clearTimeout(nextChunk);
          let body = '';
          incoming.setEncoding('utf8');
          incoming.on('data', (chunk: string) => {
            body += chunk;
          });
          incoming.on('error', fail);
          incoming.on('end', () => {
            const requestId = incoming.headers['x-amz-request-id'];
            finish({
              outcome: 'response',
              status: incoming.statusCode,
              code: body.match(/<Code>([^<]+)<\/Code>/)?.[1],
              requestId: Array.isArray(requestId) ? requestId[0] : requestId,
            });
          });
        },
      );
      request.on('error', fail);
      deadline = setTimeout(() => {
        const error = new Error(`PUT exceeded ${options.timeoutMs} ms`);
        error.name = 'TimeoutError';
        fail(error);
      }, options.timeoutMs);
      // Starts sending the request; this is not evidence of provider acceptance.
      request.flushHeaders();
      sendChunk();
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
