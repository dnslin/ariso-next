// Original CC0 test image: solid red 16000 × 16000, 8-bit RGBA PNG.
// Even Q8 RGBA pixels require 976 MiB, exceeding production's 512 MiB cache.
// Regenerate: node tests/fixtures/media/generate-watermark-cache.mjs
// Stream one reusable scanline to avoid allocating a 976 MiB source buffer.
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { crc32, createDeflate } from 'node:zlib';

const side = 16000;
const row = Buffer.alloc(1 + side * 4);
for (let x = 0; x < side; x++) {
  row[1 + x * 4] = 255;
  row[4 + x * 4] = 255;
}
const compressed = [];
const stream = Readable.from(
  (function* () {
    for (let y = 0; y < side; y++) yield row;
  })(),
).pipe(createDeflate());
for await (const chunk of stream) compressed.push(chunk);

function chunk(name, data) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(name, 4);
  data.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
  return bytes;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(side);
header.writeUInt32BE(side, 4);
header[8] = 8;
header[9] = 6;
await writeFile(
  new URL('./watermark-cache.png', import.meta.url),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', Buffer.concat(compressed)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
