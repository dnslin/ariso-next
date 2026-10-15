import { mkdir, access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import samples from './samples.json' with { type: 'json' };

const output = resolve('.data/share-viewer-prototype/assets');
await mkdir(output, { recursive: true });
for (const sample of samples) {
  const name = sample.src.split('/').at(-1);
  const file = resolve(output, name);
  try {
    await access(file);
    continue;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const id = name.split('.')[0];
  const response = await fetch(
    `https://w.wallhaven.cc/full/${id.slice(0, 2)}/wallhaven-${name}`,
  );
  if (!response.ok)
    throw new Error(
      `Sample download failed: ${response.status} ${sample.source}`,
    );
  await writeFile(file, new Uint8Array(await response.arrayBuffer()));
}
console.log(`Prepared ${samples.length} local sample images`);
