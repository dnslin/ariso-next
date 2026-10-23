import { writeFile } from 'node:fs/promises';
import ZipStream, { type FileDataInput } from 'zip-stream';

export async function writeZipFixture(
  path: string,
  entries: Array<{ name: string; value?: Buffer; data?: FileDataInput }>,
) {
  const zip = new ZipStream({ store: true, forceZip64: true });
  const chunks: Buffer[] = [];
  const collecting = (async () => {
    for await (const chunk of zip) chunks.push(chunk);
  })();
  for (const entry of entries) {
    await new Promise<void>((resolve, reject) => {
      zip.entry(
        entry.value ?? Buffer.from('entry content'),
        { name: entry.name, ...entry.data },
        (error) => {
          if (error) reject(error);
          else resolve();
        },
      );
    });
  }
  zip.finalize();
  await collecting;
  const bytes = Buffer.concat(chunks);
  await writeFile(path, bytes);
  return bytes;
}

export function replaceZipName(bytes: Buffer, before: string, after: string) {
  if (Buffer.byteLength(before) !== Buffer.byteLength(after))
    throw new Error('Fixture names must have equal encoded lengths');
  let count = 0;
  let offset = 0;
  while ((offset = bytes.indexOf(before, offset)) >= 0) {
    bytes.write(after, offset);
    offset += Buffer.byteLength(after);
    count++;
  }
  if (count !== 2)
    throw new Error(`Expected local and central names, found ${count}`);
  return bytes;
}

export function centralDirectoryOffset(bytes: Buffer) {
  const offset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (offset < 0) throw new Error('Missing fixture central directory');
  return offset;
}
