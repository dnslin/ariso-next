import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { assertStaticSvg } from './svg-policy.mjs';

// Run parsing and native rendering outside the application process so the media
// tool deadline, cancellation and crash recovery can terminate the whole job.
const [sourcePath, outputPath] = process.argv.slice(2);
const source = await readFile(sourcePath, 'utf8');
assertStaticSvg(source);
const options = { font: { loadSystemFonts: true } };
let renderer = new Resvg(source, options);
const { width, height } = renderer;
if (Math.max(width, height) > 640) {
  renderer = new Resvg(source, {
    ...options,
    fitTo: { mode: width >= height ? 'width' : 'height', value: 640 },
  });
}
await writeFile(outputPath, renderer.render().asPng());
process.stdout.write(JSON.stringify({ width, height }));
