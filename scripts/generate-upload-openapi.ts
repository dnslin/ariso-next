import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { createUploadOpenApiDocument } from '../src/server/upload/openapi.ts';

const path = fileURLToPath(
  new URL('../tests/unit/upload/openapi.generated.json', import.meta.url),
);
const generated = await format(JSON.stringify(createUploadOpenApiDocument()), {
  ...(await resolveConfig(path)),
  filepath: path,
});
const args = process.argv.slice(2);
if (args.length === 0) {
  await writeFile(path, generated);
  process.stdout.write(`Generated ${path}\n`);
} else if (args.length === 1 && args[0] === '--check') {
  const committed = await readFile(path, 'utf8');
  if (committed !== generated)
    throw new Error(
      'Upload OpenAPI has changed; run pnpm run openapi:generate and commit the generated document.',
    );
  process.stdout.write('Upload OpenAPI is current.\n');
} else {
  throw new Error('Usage: node scripts/generate-upload-openapi.ts [--check]');
}
