import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import {
  parseBackupS3Args,
  loadBackupS3Targets,
  backupVerificationPrefixes,
  cleanupBackupScope,
} from '../../../scripts/verify-backup-s3.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
it('requires explicit private configs, accepts repeated inputs, and rejects unknown flags', () => {
  expect(
    parseBackupS3Args([
      '--config',
      '/private/r2.json',
      '--config',
      '/private/seaweed.json',
      '--output',
      '/tmp/evidence',
    ]),
  ).toEqual({
    configs: ['/private/r2.json', '/private/seaweed.json'],
    output: '/tmp/evidence',
  });
  expect(() => parseBackupS3Args([])).toThrow('config');
  expect(() =>
    parseBackupS3Args(['--config', 'file.json', '--deploy']),
  ).toThrow();
});
it('loads the existing private array format without copying it to evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-backup-cli-'));
  directories.push(directory);
  const file = join(directory, 'private.json');
  const config = [
    {
      service: 'r2',
      endpoint: 'https://example.invalid',
      region: 'auto',
      bucket: 'images',
      forcePathStyle: false,
      credentials: { accessKeyId: 'fake-key', secretAccessKey: 'fake-secret' },
    },
  ];
  await writeFile(file, JSON.stringify(config));
  expect(await loadBackupS3Targets([file])).toEqual(config);
  expect(await readFile(file, 'utf8')).toBe(JSON.stringify(config));
});
it('reports malformed configuration without echoing embedded secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-backup-cli-'));
  directories.push(directory);
  const file = join(directory, 'private.json');
  await writeFile(file, '{"fake-secret": malformed');
  const error = await loadBackupS3Targets([file]).catch(
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toContain('fake-secret');
});
it('gives source, destination and sentinel distinct random namespaces', () => {
  const first = backupVerificationPrefixes();
  const second = backupVerificationPrefixes();
  expect(new Set(Object.values(first)).size).toBe(3);
  expect(first).not.toEqual(second);
  for (const prefix of Object.values(first))
    expect(prefix).toMatch(
      /^ariso-backup-verification\/[a-f0-9-]+\/(source|destination|sentinel)$/,
    );
});
it('cleans only the registered adapter namespace and verifies that it is empty', async () => {
  const owned = new Map([
    ['images/a', 4],
    ['restore-owner', 2],
  ]);
  const neighbor = new Map([['unrelated', 3]]);
  const storage = {
    async *listObjects() {
      yield [...owned].map(([key, size]) => ({ key, size }));
    },
    deleteObject: vi.fn(async (key: string) => {
      owned.delete(key);
      return { metadata: {} };
    }),
  };
  expect(await cleanupBackupScope(storage)).toBe(2);
  expect([...neighbor]).toEqual([['unrelated', 3]]);
  expect(storage.deleteObject.mock.calls.map(([key]) => key)).toEqual([
    'images/a',
    'restore-owner',
  ]);
});
it('propagates cleanup failures instead of reporting a clean target', async () => {
  const storage = {
    async *listObjects() {
      yield [{ key: 'retained', size: 2 }];
    },
    async deleteObject() {
      throw new Error('Access denied');
    },
  };
  await expect(cleanupBackupScope(storage)).rejects.toThrow('Access denied');
});

it('can be imported in a real Node process without parsing CLI arguments or starting provider work', async () => {
  const result = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('./scripts/verify-backup-s3.ts'); process.stdout.write('import-only');",
    ],
    { cwd: process.cwd(), timeout: 10000 },
  );
  expect(result.stdout).toBe('import-only');
  expect(result.stderr).toBe('');
});
