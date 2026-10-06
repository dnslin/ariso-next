import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { assertStaticSvg } from './svg-policy.mjs';

// Run parsing and native rendering outside the application process so the media
// tool deadline, cancellation and crash recovery can terminate the whole job.
const [sourcePath, outputPath, renderSize] = process.argv.slice(2);
const source = await readFile(sourcePath, 'utf8');
let width;
let height;
let png;
try {
  const { hasText } = assertStaticSvg(source);
  const options = { font: { loadSystemFonts: hasText } };
  let renderer = new Resvg(source, options);
  ({ width, height } = renderer);
  if (renderSize !== 'preview' || Math.max(width, height) > 640) {
    renderer = new Resvg(source, {
      ...options,
      fitTo:
        renderSize === 'preview'
          ? { mode: width >= height ? 'width' : 'height', value: 640 }
          : { mode: 'width', value: Number(renderSize) },
    });
  }
  png = renderer.render().asPng();
} catch (error) {
  // Admission distinguishes invalid SVG from module loading and file I/O failures.
  console.error(error);
  process.exit(2);
}
await writeFile(outputPath, png);
process.stdout.write(JSON.stringify({ width, height }));
