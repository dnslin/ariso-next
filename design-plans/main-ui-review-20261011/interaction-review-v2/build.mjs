import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vitest'))('esbuild');
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))(
  'postcss',
);
const tailwind = require('@tailwindcss/postcss');
const directory = 'design-plans/main-ui-review-20261011/interaction-review-v2';
const output = resolve(`${directory}/dist`);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [`${directory}/main.tsx`],
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
      setup(builder) {
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: 'navigation',
          namespace: 'prototype',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'prototype' }, () => ({
          resolveDir: process.cwd(),
          contents: `import {useSyncExternalStore} from 'react';const subscribe=callback=>{window.addEventListener('popstate',callback);return()=>window.removeEventListener('popstate',callback)};export const usePathname=()=>useSyncExternalStore(subscribe,()=>window.location.pathname);export const useRouter=()=>({push:href=>{window.history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'))}});`,
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
await writeFile(
  `${output}/style.css`,
  `${css.css}\n${await readFile(`${directory}/style.css`, 'utf8')}`,
);
await writeFile(
  `${output}/index.html`,
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ariso · 操作减负原型</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>',
);
console.log(`Prototype built: ${output}`);
