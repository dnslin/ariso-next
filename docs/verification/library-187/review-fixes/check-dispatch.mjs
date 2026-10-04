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

// Verify the actual shared runner feedback gate without starting any browser.
const runner = await readFile('scripts/verify-browser.mjs', 'utf8');
const feedbackGate = runner.match(
  /if \((.*)\) \{\n  try \{\n    assert.ok\(values\['preview-config'\]/,
)?.[1];
assert.ok(feedbackGate, 'Storage feedback gate must be located');
const feedbackResults = ['library-copy', 'storage-admin', 'library-batch'].map(
  (suite) => ({
    suite,
    storagePreview: runInNewContext(feedbackGate, { suite, only: 'feedback' }),
  }),
);
console.log(JSON.stringify(feedbackResults, null, 2));
for (const result of feedbackResults)
  assert.equal(result.storagePreview, result.suite === 'storage-admin');

// Run the actual pure stage selection expression for the integrated suites.
const stagesDeclaration = runner.slice(
  runner.indexOf('    const stages ='),
  runner.indexOf('    report.taskSpaceId = config.spaceId;'),
);
assert.ok(stagesDeclaration.includes('const stages ='));
for (const [suite, only, expected] of [
  ['library-copy', undefined, ['library-copy']],
  ['library-copy', 'feedback', ['library-copy']],
  ['library-copy', 'revision', ['library-copy']],
  ['trash', undefined, ['trash-query-batch', 'trash-cleanup']],
  ['storage-admin', undefined, ['storage-admin', 'shell-navigation']],
  ['storage-admin', 'live', ['storage-admin-live']],
  ['library-reprocess', undefined, ['library-batch-reprocess']],
]) {
  const stages = runInNewContext(`${stagesDeclaration}\nstages`, {
    suite,
    only,
  });
  assert.deepEqual(
    Array.from(stages, (stage) => stage[0]),
    expected,
  );
}
console.log('Integrated focused stage selection passed.');
