import { createWriteStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
// Disposable receiver only: no auth, submission, media or storage business API.
export const maximum = 50 * 1024 * 1024;
export const fieldBudget = 256 * 1024;
export type Result = {
  code: string;
  bytes: number;
  diskBytes: number;
  fields: Record<string, string[]>;
  peakBuffered: number;
  cleaned: boolean;
};

export async function receive(
  req: IncomingMessage,
  root: string,
  slow: boolean,
  fileMaximum = maximum,
): Promise<Result> {
  const directory = await mkdtemp(join(root, 'request-'));
  const path = join(directory, 'body');
  const fields: Record<string, string[]> = {};
  let code = 'OK';
  let bytes = 0;
  let files = 0;
  let fieldBytes = 0;
  let peakBuffered = 0;
  const fail = (reason: string) => {
    if (code === 'OK') code = reason;
  };
  // Busboy signals limit at equality. max + 1 allows exactly max bytes.
  const parser = busboy({
    headers: req.headers,
    highWaterMark: 65536,
    fileHwm: 65536,
    limits: { files: 1, fileSize: fileMaximum + 1, fieldSize: fieldBudget + 1 },
  });
  const writers: Promise<void>[] = [];
  parser.on('file', (name, file) => {
    files++;
    if (name !== 'file') fail('UNKNOWN_FILE_FIELD');
    file.on('limit', () => fail('FILE_TOO_LARGE'));
    const count = new Transform({
      highWaterMark: 65536,
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        peakBuffered = Math.max(
          peakBuffered,
          file.readableLength +
            parser.writableLength +
            this.readableLength +
            this.writableLength,
        );
        if (bytes > fileMaximum) fail('FILE_TOO_LARGE');
        const finish = () => callback(null, code === 'OK' ? chunk : undefined);
        if (slow) setTimeout(finish, 2);
        else finish();
      },
    });
    writers.push(
      pipeline(file, count, createWriteStream(path)).catch((error: Error) =>
        fail(`STREAM:${error.message}`),
      ),
    );
  });
  parser.on('filesLimit', () => fail('SECOND_FILE'));
  parser.on('fieldsLimit', () => fail('FIELDS_LIMIT'));
  parser.on('partsLimit', () => fail('PARTS_LIMIT'));
  parser.on('field', (name, value, info) => {
    fieldBytes += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (info.valueTruncated || info.nameTruncated || fieldBytes > fieldBudget) {
      fail('FIELDS_TOO_LARGE');
      return;
    }
    if (code !== 'OK') return;
    if (!['storageId', 'albumId', 'tag', 'visibility'].includes(name)) {
      fail('UNKNOWN_FIELD');
      return;
    }
    if (['storageId', 'visibility'].includes(name) && fields[name])
      fail('DUPLICATE_SCALAR');
    (fields[name] ??= []).push(value);
  });
  const completed = new Promise<void>((resolve) => parser.on('close', resolve));
  parser.on('error', () => fail('TRUNCATED'));
  req.on('aborted', () => {
    fail('DISCONNECTED');
    parser.destroy(new Error('client disconnected'));
  });
  req.on('error', () => {
    fail('DISCONNECTED');
    parser.destroy(new Error('request failed'));
  });
  req.pipe(parser);
  await completed;
  await Promise.all(writers);
  if (!files) fail('MISSING_FILE');
  if (!bytes) fail('EMPTY_FILE');
  const diskBytes = files ? (await stat(path)).size : 0;
  await rm(directory, { recursive: true });
  return {
    code,
    bytes,
    diskBytes,
    fields,
    peakBuffered,
    cleaned: (await readdir(root)).length === 0,
  };
}
