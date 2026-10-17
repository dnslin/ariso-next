import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { partitionTraceWarnings } from '../../../scripts/standalone-trace.mjs';

const require = createRequire(import.meta.url);
const nft = require('next/dist/compiled/@vercel/nft/index.js') as {
  nodeFileTrace: (
    entries: string[],
    options: { base: string; processCwd?: string },
  ) => Promise<{ warnings: Set<Error> }>;
};

it('recognizes unavailable native alternatives and optional telemetry in the installed loaders', async () => {
  const result = await nft.nodeFileTrace(
    [
      require.resolve('@resvg/resvg-js'),
      require.resolve('better-sqlite3'),
      require.resolve('better-auth/crypto'),
    ],
    { base: process.cwd(), processCwd: process.cwd() },
  );
  const { expected, unexpected } = partitionTraceWarnings(result.warnings);
  expect(expected.length).toBeGreaterThan(0);
  expect(unexpected).toEqual([]);
});

it('retains missing required imports and optional-looking names from other callers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-trace-test-'));
  try {
    const entry = join(directory, 'entry.mjs');
    await writeFile(
      entry,
      `import './required-file.js';
       import '@opentelemetry/api';
       import '@resvg/resvg-js-not-a-platform';`,
    );
    const result = await nft.nodeFileTrace([entry], { base: directory });
    const { expected, unexpected } = partitionTraceWarnings(result.warnings);
    expect(expected).toEqual([]);
    expect(unexpected).toHaveLength(3);
    expect(unexpected.map((warning) => warning.message).join('\n')).toContain(
      'required-file.js',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
