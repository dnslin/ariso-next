// Run: node integrations/browser-extension/scripts/generate-icons.mjs
// Uses the project's existing ImageMagick and bundled Caveat font; downloads nothing.
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const local = (path) => fileURLToPath(new URL(path, import.meta.url));
const preview = local('./icon-preview.png');
await mkdir(local('../public/icon/'), { recursive: true });
execFileSync('magick', [
  '-size',
  '512x512',
  'xc:none',
  '-fill',
  '#e3f6f5',
  '-draw',
  'roundrectangle 0,0 511,511 120,120',
  '-font',
  local('../public/fonts/caveat.woff2'),
  '-weight',
  '400',
  '-pointsize',
  '384',
  '-gravity',
  'center',
  '-fill',
  '#272343',
  '-annotate',
  '+0-8',
  'A',
  '-strip',
  preview,
]);
for (const size of [16, 32, 48, 128]) {
  execFileSync('magick', [
    preview,
    '-resize',
    `${size}x${size}`,
    '-strip',
    local(`../public/icon/${size}.png`),
  ]);
}
