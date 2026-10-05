import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const runner = resolve('scripts/verify-browser.mjs');
function parse(args: string[]) {
  // The invalid Page label deliberately stops after actual argument validation,
  // before any application, browser, output directory or fixture is started.
  return spawnSync(process.execPath, [runner, ...args], {
    env: { ...process.env, EGO_PAGE_LABEL: 'invalid' },
    encoding: 'utf8',
    timeout: 10000,
  });
}

describe('browser runner argument boundaries', () => {
  const combinations = [
    ['full'],
    ['viewer'],
    ['viewer', 'representative'],
    ['viewer', 'behavior'],
    ['viewer', 'recovery'],
    ['viewer', 'refresh'],
    ['viewer', 'consumers'],
    ['viewer', 'deleted-source'],
    ['viewer', 'pending-navigation'],
    ['upload', 'relations'],
    ['upload'],
    ['upload', 'submissions'],
    ['upload-regression'],
    ['upload-s3', 'cleanup'],
    ['upload-s3'],
    ['copy-dropdown'],
    ['library-reprocess'],
    ['library-copy', 'representative'],
    ['library-copy'],
    ['library-copy', 'feedback'],
    ['library-copy', 'revision'],
    ['storage-admin', 'live'],
    ['storage-admin'],
    ['storage-admin', 'dialogs'],
    ['storage-admin', 'feedback'],
    ['storage-admin', 'regressions'],
    ['processing'],
    ['processing', 'representative'],
    ['processing', 'settings'],
    ['processing', 'preview'],
    ['processing', 'recovery'],
    ['processing', 'consumers'],
    ['account'],
    ['trash', 'representative'],
    ['trash'],
    ['trash', 'cleanup'],
    ['trash', 'query-error'],
    ['trash', 'confirmation'],
    ['trash', 'approved-ui'],
    ['trash', 'approved-results'],
    ['trash', 'approved-query'],
    ['trash', 'approved-progress'],
    ['trash', 'review-fixes'],
    ['library-batch', 'representative'],
    ['library-batch'],
    ['library-batch', 'visibility'],
    ['library-batch', 'feedback'],
    ['library-batch', 'tag-states'],
    ['library-batch', 'lifecycle'],
    ['library-batch', 'cache'],
    ['library-batch', 'review-fixes'],
    ['sharing-experiment'],
  ];
  it.each(combinations)('accepts suite %s and its only %s', (suite, only) => {
    const result = parse(['--suite', suite, ...(only ? ['--only', only] : [])]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Invalid EGO_PAGE_LABEL');
  });

  it.each([
    [
      '--only',
      'representative',
      '--only requires an applicable targeted suite',
    ],
    [
      '--storage-config',
      'unused.json',
      '--storage-config applies only to storage-admin live',
    ],
    [
      '--preview-config',
      'unused.json',
      '--preview-config applies only to storage-admin feedback',
    ],
  ])('rejects unrelated sharing parameter %s', (option, value, error) => {
    const result = parse(['--suite', 'sharing-experiment', option, value]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
  });

  it.each([
    ['--storage-config', '--storage-config applies only to storage-admin live'],
    [
      '--preview-config',
      '--preview-config applies only to storage-admin feedback',
    ],
  ])('rejects storage-only processing parameter %s', (option, error) => {
    const result = parse(['--suite', 'processing', option, 'unused.json']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
  });

  it.each([
    [
      '--only',
      'representative',
      '--only requires an applicable targeted suite',
    ],
    [
      '--storage-config',
      'unused.json',
      '--storage-config applies only to storage-admin live',
    ],
    [
      '--preview-config',
      'unused.json',
      '--preview-config applies only to storage-admin feedback',
    ],
  ])('rejects unrelated account parameter %s', (option, value, error) => {
    const result = parse(['--suite', 'account', option, value]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
  });

  it('requires an existing space without starting unrelated production fixtures', () => {
    const output = mkdtempSync(join(tmpdir(), 'sharing-runner-'));
    try {
      const result = spawnSync(
        process.execPath,
        [runner, '--suite', 'sharing-experiment'],
        {
          env: {
            ...process.env,
            EGO_TASK_SPACE: '',
            EGO_PAGE_LABEL: 'p1',
            BROWSER_REPORT_DIR: output,
          },
          encoding: 'utf8',
          timeout: 10000,
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Existing Ego space required');
      const report = JSON.parse(
        readFileSync(join(output, 'runner.json'), 'utf8'),
      );
      expect(report).toMatchObject({
        suite: 'sharing-experiment',
        status: 'failed',
      });
      expect(report.error).toContain('Existing Ego space required');
      expect(report).not.toHaveProperty('origin');
      expect(report).not.toHaveProperty('sharingOrigin');
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
