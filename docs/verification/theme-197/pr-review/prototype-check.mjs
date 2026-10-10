import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest'));
const { build } = vitestRequire('esbuild');
const sourcePath = 'design-plans/issue197-icon-review/main.tsx';
globalThis.location = { pathname: '/' };

const results = [];
for (const version of ['before', 'after']) {
  const rawContents =
    version === 'before'
      ? execFileSync('git', ['show', `cc5e8088:${sourcePath}`], {
          encoding: 'utf8',
        })
      : await readFile(sourcePath, 'utf8');
  const contents = rawContents
    .replace(/\/\/ Prototype navigation[\s\S]*?(?=createRoot\()/, '')
    .replace("document.getElementById('root')!", 'null');
  const output = resolve(`.data/theme-197/prototype-review-${version}.mjs`);
  await build({
    stdin: {
      contents,
      resolveDir: resolve('design-plans/issue197-icon-review'),
      loader: 'tsx',
    },
    outfile: output,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    plugins: [
      {
        name: 'review-ssr-capture',
        setup(builder) {
          builder.onResolve(
            { filter: /^(next\/navigation|react-dom\/client)$/ },
            ({ path }) => ({ path, namespace: 'capture' }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: 'capture' },
            ({ path }) => ({
              contents:
                path === 'next/navigation'
                  ? 'export const usePathname = () => "/dashboard";'
                  : 'export const createRoot = () => ({ render: element => { globalThis.reviewElement = element; } });',
            }),
          );
        },
      },
    ],
  });
  await import(output);
  const html = renderToString(globalThis.reviewElement);
  const count = (html.match(/data-testid="theme-(?:trigger|cycle)"/g) ?? [])
    .length;
  const legacy = (html.match(/data-testid="theme-cycle"/g) ?? []).length;
  results.push({
    version,
    controls: count,
    legacyControls: legacy,
    expected: 2,
  });
  if (version === 'before')
    assert.throws(() => assert.equal(count, 2), assert.AssertionError);
  else {
    assert.equal(count, 2);
    assert.equal(legacy, 0);
  }
}
await writeFile(
  '.data/theme-197/prototype-review-check.json',
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(results);
