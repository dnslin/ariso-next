const maxJsonBodyBytes = 256 * 1024;

export class JsonBodyTooLargeError extends Error {
  constructor() {
    super('请求内容超过 256 KiB');
    this.name = 'JsonBodyTooLargeError';
  }
}

/** Count received bytes before decoding or parsing, regardless of Content-Length. */
export async function readBoundedJsonBytes(request: Request): Promise<Buffer> {
  if (!request.body) return Buffer.alloc(0);
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
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  return JSON.parse(
    new TextDecoder().decode(await readBoundedJsonBytes(request)),
  ) as unknown;
}
