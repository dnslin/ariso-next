import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readGitChangedPaths,
  selectChangedModules,
  selectEventModules,
} from '../../../scripts/ci-module-changes.mjs';

const none = { app: false, browser: false, picgo: false, contract: false };
const all = { app: true, browser: true, picgo: true, contract: true };
const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

describe('module change selection', () => {
  it('selects only the owning plugin for its source, tests and metadata', () => {
    expect(
      selectChangedModules([
        'integrations/browser-extension/components/queue.tsx',
        'integrations/browser-extension/package.json',
      ]),
    ).toEqual({ ...none, browser: true });
    expect(
      selectChangedModules([
        'integrations/picgo/lib/result.cjs',
        'integrations/picgo/README.md',
      ]),
    ).toEqual({ ...none, picgo: true });
  });
  it('keeps normal app and app-test changes inside the main app', () => {
    expect(
      selectChangedModules([
        'src/components/library/view.tsx',
        'src/server/library/query.ts',
        'tests/unit/library/query.test.ts',
        'drizzle/0034_app.sql',
      ]),
    ).toEqual({ ...none, app: true });
  });
  it.each([
    'src/server/upload/public-contract.ts',
    'src/server/upload/public-http.ts',
    'src/server/upload/public-result.ts',
    'src/server/upload/capabilities.ts',
    'src/server/identity/tokens.ts',
    'src/server/identity/auth.ts',
    'src/server/delivery/links.ts',
    'src/app/api/upload/route.ts',
    'src/app/api/upload/capabilities/route.ts',
    'src/app/api/openapi.json/route.ts',
    'tests/unit/upload/openapi.generated.json',
    'tests/integration/upload/picgo.test.ts',
    'tests/integration/upload/browser-extension.test.ts',
    'scripts/generate-upload-openapi.ts',
  ])(
    'selects provider and both consumers for public contract path %s',
    (path) => {
      expect(selectChangedModules([path])).toEqual(all);
    },
  );
  it.each([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    'eslint.config.mjs',
    'tsconfig.json',
    'tsconfig.runtime.json',
    'vitest.config.ts',
    'scripts/ci-module-changes.mjs',
    '.github/workflows/ci.yml',
  ])('selects all modules after shared configuration %s changes', (path) => {
    expect(selectChangedModules([path])).toEqual(all);
  });
  it('does not confuse another path with a plugin directory prefix', () => {
    expect(
      selectChangedModules(['integrations/browser-extension-backup/source.ts']),
    ).toEqual(all);
    expect(selectChangedModules(['integrations/picgo-old/index.cjs'])).toEqual(
      all,
    );
  });
  it('keeps known prose-only changes out of product suites', () => {
    expect(
      selectChangedModules([
        'docs/guides/picgo.md',
        'tasks/browser-extension/plan.md',
        'docs/archive/prototypes-20261026.md',
        'README.md',
      ]),
    ).toEqual(none);
  });
  it.each([
    'prototypes/browser-extension/app/page.tsx',
    'design-plans/access-protection/README.md',
  ])('treats retired prototype path %s as unknown ownership', (path) => {
    expect(selectChangedModules([path])).toEqual(all);
  });
  it('unions independent changes, preserves an empty diff, and runs all for an unknown path', () => {
    expect(selectChangedModules([])).toEqual(none);
    expect(
      selectChangedModules([
        'src/app/page.tsx',
        'integrations/picgo/index.cjs',
      ]),
    ).toEqual({ ...none, app: true, picgo: true });
    expect(selectChangedModules(['new-shared-system/config.json'])).toEqual(
      all,
    );
  });
});

function repository() {
  const path = mkdtempSync(join(tmpdir(), 'ariso-ci-selection-'));
  directories.push(path);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'CI selector fixture');
  git('config', 'user.email', 'fixture@example.test');
  const put = (name: string) => {
    mkdirSync(dirname(join(path, name)), { recursive: true });
    writeFileSync(join(path, name), 'fixture\n');
  };
  const commit = () => {
    git('add', '--all');
    git('commit', '--quiet', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  return { path, git, put, commit };
}

it('includes deletions and both ends of a rename across module boundaries', () => {
  const repo = repository();
  repo.put('src/components/old.ts');
  repo.put('integrations/picgo/lib/deleted.cjs');
  const base = repo.commit();
  mkdirSync(join(repo.path, 'integrations/browser-extension/lib'), {
    recursive: true,
  });
  renameSync(
    join(repo.path, 'src/components/old.ts'),
    join(repo.path, 'integrations/browser-extension/lib/moved.ts'),
  );
  rmSync(join(repo.path, 'integrations/picgo/lib/deleted.cjs'));
  const head = repo.commit();
  const paths = readGitChangedPaths(base, head, repo.path);
  expect(paths.sort()).toEqual([
    'integrations/browser-extension/lib/moved.ts',
    'integrations/picgo/lib/deleted.cjs',
    'src/components/old.ts',
  ]);
  expect(selectChangedModules(paths)).toEqual({ ...all, contract: false });
});

it('selects all for first push or an unavailable push base', () => {
  expect(
    selectEventModules('push', {
      before: '0'.repeat(40),
      after: '1'.repeat(40),
    }).modules,
  ).toEqual(all);
  const repo = repository();
  repo.put('README.md');
  const head = repo.commit();
  expect(
    selectEventModules(
      'push',
      { before: 'f'.repeat(40), after: head },
      repo.path,
    ).modules,
  ).toEqual(all);
});

it('reports a missing checked-out head instead of treating a failed comparison as no changes', () => {
  const repo = repository();
  repo.put('README.md');
  const base = repo.commit();
  expect(() =>
    selectEventModules(
      'push',
      { before: base, after: 'f'.repeat(40) },
      repo.path,
    ),
  ).toThrow('head commit');
});

it('uses the pull-request merge base so unrelated newer main changes do not select the app', () => {
  const repo = repository();
  repo.put('README.md');
  const common = repo.commit();
  repo.git('checkout', '--quiet', '-b', 'topic');
  repo.put('integrations/browser-extension/lib/source.ts');
  const head = repo.commit();
  repo.git('checkout', '--quiet', '-b', 'new-base', common);
  repo.put('src/components/unrelated-main.ts');
  const base = repo.commit();
  expect(
    selectEventModules(
      'pull_request',
      { pull_request: { base: { sha: base }, head: { sha: head } } },
      repo.path,
    ).modules,
  ).toEqual({ ...none, browser: true });
});

it('takes pull request SHA fields and writes boolean outputs without executing title or branch text', () => {
  const repo = repository();
  repo.put('README.md');
  const base = repo.commit();
  repo.put('integrations/browser-extension/lib/source.ts');
  const head = repo.commit();
  const marker = join(repo.path, 'must-not-exist');
  const payload = {
    pull_request: {
      title: `$(touch ${marker})`,
      base: { sha: base, ref: '`exit 99`' },
      head: { sha: head, ref: '$(exit 99)' },
    },
  };
  const eventPath = join(repo.path, 'event.json');
  const outputPath = join(repo.path, 'output');
  writeFileSync(eventPath, JSON.stringify(payload));
  execFileSync(process.execPath, [resolve('scripts/ci-module-changes.mjs')], {
    cwd: repo.path,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
    },
  });
  expect(readFileSync(outputPath, 'utf8')).toBe(
    'app=false\nbrowser=true\npicgo=false\ncontract=false\n',
  );
  expect(existsSync(marker)).toBe(false);
});
