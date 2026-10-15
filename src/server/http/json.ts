const maxJsonBodyBytes = 256 * 1024;

export class JsonBodyTooLargeError extends Error {
  constructor() {
    super('请求内容超过 256 KiB');
    this.name = 'JsonBodyTooLargeError';
  }
}

/** Count received bytes before decoding or parsing, regardless of Content-Length. */
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return JSON.parse('') as unknown;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxJsonBodyBytes) {
        await reader.cancel();
        throw new JsonBodyTooLargeError();
      }
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder().decode(Buffer.concat(chunks)),
    ) as unknown;
  } finally {
    reader.releaseLock();
  }
}
