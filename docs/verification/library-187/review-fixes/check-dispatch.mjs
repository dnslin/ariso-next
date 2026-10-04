import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Offline dispatch diagnosis only; this does not exercise the browser scenes.
const source = await readFile('e2e/library-copy.mjs', 'utf8');
const declarations = source.slice(
  source.indexOf('const representative ='),
  source.indexOf('const report ='),
);
const consumers = source.match(
  /if \(([^)]+)\) \{\s*const \{ verifyCopyConsumers \}/,
)?.[1];
const albumSuccess = source.match(
  /if \(([^)]+)\) \{\s*const \{ resizeViewport, setTheme \}/,
)?.[1];
assert.ok(consumers && albumSuccess, 'Both real scene guards must be located');
const results = [undefined, 'revision', 'representative', 'feedback'].map(
  (phase) => ({
    phase: phase ?? 'full',
    ...runInNewContext(
      `${declarations}\n({ consumers: (${consumers}), albumSuccess: (${albumSuccess}) })`,
      { config: { libraryCopyPhase: phase } },
    ),
  }),
);
console.log(JSON.stringify(results, null, 2));
for (const result of results) {
  const included = result.phase === 'full' || result.phase === 'revision';
  assert.equal(result.consumers, included, `${result.phase}: consumers`);
  assert.equal(result.albumSuccess, included, `${result.phase}: album success`);
}
