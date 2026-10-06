import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedViewerFixtures } from './e2e/library-viewer-fixtures.mjs';
const directory = await mkdtemp(
  join(tmpdir(), 'ariso-viewer-generation-error-'),
);
const output = join(directory, 'output');
await mkdir(output);
let error;
try {
  await seedViewerFixtures(
    {
      dataDirectory: directory,
      output,
      projectDirectory: join(directory, 'missing-project'),
    },
    async () =>
      assert.fail('generation failure must precede database registration'),
  );
} catch (cause) {
  error = {
    code: cause.code,
    missingGenerationInput: cause.message.includes('sample.png'),
  };
}
try {
  assert.equal(error.missingGenerationInput, true);
  assert.deepEqual(await readdir(output), []);
  const result = {
    failedGeneration: true,
    temporaryTemplatesCleaned: true,
    databaseRegistrationNotReached: true,
  };
  await writeFile(
    resolve(
      'test-results/sharing-192/viewer-fixture-lifecycle/generation-error.json',
    ),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await rm(directory, { recursive: true, force: true });
}
