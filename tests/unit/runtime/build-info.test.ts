import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readBuildIdentity } from '../../../src/server/runtime/build-info.ts';
import { writeBuildMetadata } from '../../../scripts/build-metadata.mjs';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-build-info-'));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('backup build identity', () => {
  it('keeps an unlabelled development build unlabelled', () => {
    const output = join(directory, 'dist/build-info.json');
    writeBuildMetadata({ env: {}, output });
    expect(readBuildIdentity(output)).toBeNull();
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(null);
  });

  it('preserves the explicit release version and source revision', () => {
    const output = join(directory, 'build-info.json');
    const identity = { version: 'v1.3.0-local', revision: 'a'.repeat(40) };
    writeBuildMetadata({
      output,
      env: {
        ARISO_BUILD_VERSION: identity.version,
        ARISO_BUILD_REVISION: identity.revision,
      },
    });
    expect(readBuildIdentity(output)).toEqual(identity);
  });

  it('rejects an incomplete or malformed declared identity', () => {
    const output = join(directory, 'build-info.json');
    for (const env of [
      { ARISO_BUILD_VERSION: 'v1.3.0' },
      { ARISO_BUILD_VERSION: 'latest', ARISO_BUILD_REVISION: 'a'.repeat(40) },
      { ARISO_BUILD_VERSION: 'v1.3.0', ARISO_BUILD_REVISION: 'HEAD' },
    ]) {
      expect(() => writeBuildMetadata({ output, env })).toThrow(/build/i);
    }
  });

  it('does not invent metadata from an absent file or accept corrupt metadata', () => {
    const output = join(directory, 'build-info.json');
    expect(readBuildIdentity(output)).toBeNull();
    writeFileSync(output, '{broken');
    expect(() => readBuildIdentity(output)).toThrow();
    writeFileSync(output, JSON.stringify({ version: '0.1.0' }));
    expect(() => readBuildIdentity(output)).toThrow(/build/i);
  });
});
