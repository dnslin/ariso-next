import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { DOMParser } from '@xmldom/xmldom';
import { assertStaticSvg } from './svg-policy.mjs';

// Run parsing and native rendering outside the application process so the media
// tool deadline, cancellation and crash recovery can terminate the whole job.
const [sourcePath, outputPath, renderSize, fitMode] = process.argv.slice(2);
const source = await readFile(sourcePath, 'utf8');
let width;
let height;
let png;
try {
  const { hasText } = assertStaticSvg(source);
  const options = { font: { loadSystemFonts: hasText } };
  let renderer = new Resvg(source, options);
  ({ width, height } = renderer);
  if (renderSize !== 'preview' && fitMode === 'longest-edge') {
    // A square viewport preserves subpixel-thin artwork without a zero-sized
    // raster edge. The serialized size retains fractions unlike Resvg's getters.
    const normalized = renderer.toString();
    const root = new DOMParser().parseFromString(
      normalized,
      'image/svg+xml',
    ).documentElement;
    renderer = new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Number(renderSize)}" height="${Number(renderSize)}" viewBox="0 0 ${root.getAttribute('width')} ${root.getAttribute('height')}">${normalized}</svg>`,
      options,
    );
  } else if (renderSize !== 'preview' || Math.max(width, height) > 640) {
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
