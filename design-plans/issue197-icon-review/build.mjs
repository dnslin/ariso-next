import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest'));
const { build } = vitestRequire('esbuild');
const tailwindRequire = createRequire(require.resolve('@tailwindcss/postcss'));
const postcss = tailwindRequire('postcss');
const tailwind = require('@tailwindcss/postcss');
const output = resolve('.data/theme-197/icon-prototype');
await mkdir(output, { recursive: true });
await build({
  entryPoints: ['design-plans/issue197-icon-review/main.tsx'],
  outdir: output,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'prototype-navigation',
      setup(build) {
        build.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: 'prototype-navigation',
          namespace: 'prototype',
        }));
        build.onLoad({ filter: /.*/, namespace: 'prototype' }, () => ({
          contents: 'export const usePathname = () => "/dashboard";',
        }));
      },
    },
  ],
});
const css = await postcss([
  tailwind({ base: process.cwd(), optimize: true, transformAssetUrls: false }),
]).process(await readFile('src/app/globals.css', 'utf8'), {
  from: resolve('src/app/globals.css'),
});
await writeFile(`${output}/style.css`, css.css);
await writeFile(
  `${output}/index.html`,
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ariso · 后台主题图标原型</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>',
);
console.log(output);
