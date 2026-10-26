import { crc32 } from 'node:zlib';

/** Give controlled PNG fixtures distinct original bytes while retaining their pixels. */
export function distinctPng(bytes: Buffer, identity: string) {
  const text = Buffer.from(`fixture\0${identity}`, 'utf8');
  const body = Buffer.concat([Buffer.from('tEXt'), text]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(text.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), chunk.length - 4);
  return Buffer.concat([bytes.subarray(0, -12), chunk, bytes.subarray(-12)]);
}
