import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const allModules = () => ({
  app: true,
  browser: true,
  picgo: true,
  contract: true,
});
const sharedFiles = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.pnpmfile.cjs',
  'scripts/ci-module-changes.mjs',
]);
const appFiles = new Set(['Dockerfile', '.dockerignore', '.env.example']);

function sharedConfiguration(path) {
  return (
    sharedFiles.has(path) ||
    path.startsWith('.github/workflows/') ||
    /^(?:eslint\.config\.[^/]+|tsconfig(?:\.[^/]+)?\.json|vitest\.config\.[^/]+|\.prettierrc(?:\.[^/]+)?|\.prettierignore)$/.test(
      path,
    )
  );
}
function publicContract(path) {
  return (
    path.startsWith('src/server/upload/') ||
    path.startsWith('src/server/delivery/') ||
    /^src\/server\/identity\/(tokens|auth|schema|validation)\.ts$/.test(path) ||
    /^src\/server\/media\/(schema|images|settings|validation|fingerprints|duplicates)\.ts$/.test(
      path,
    ) ||
    /^src\/shared\/upload-(settings|name)\.ts$/.test(path) ||
    /^src\/app\/(api\/upload(?:\/|$)|api\/openapi\.json\/|i\/)/.test(path) ||
    /^tests\/(unit|integration)\/upload\/(api(?:-|\.)|public-|capabilities|openapi|picgo|browser-extension)/.test(
      path,
    ) ||
    /^tests\/(unit|integration)\/identity\/(upload-token-consumption|api-key)/.test(
      path,
    ) ||
    path === 'scripts/generate-upload-openapi.ts'
  );
}

/** Paths come from git, including deleted files. Unknown ownership selects every module. */
export function selectChangedModules(paths) {
  const modules = { app: false, browser: false, picgo: false, contract: false };
  for (const path of paths) {
    if (path.startsWith('integrations/browser-extension/'))
      modules.browser = true;
    else if (path.startsWith('integrations/picgo/')) modules.picgo = true;
    else if (sharedConfiguration(path) || publicContract(path))
      return allModules();
    else if (
      /^(docs|tasks)\//.test(path) ||
      ['README.md', 'LICENSE', 'AGENTS.md'].includes(path)
    )
      continue;
    else if (/^(prototypes|design-plans)\//.test(path)) {
      // Prototype TS/JS is still covered by the root's existing static checks.
      if (/\.[cm]?[jt]sx?$/.test(path)) modules.app = true;
    } else if (
      /^(src|tests|scripts|drizzle|public|e2e)\//.test(path) ||
      appFiles.has(path) ||
      /^(next|postcss|drizzle)\.config\.[^/]+$/.test(path)
    )
      modules.app = true;
    else return allModules();
  }
  return modules;
}

const validSha = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{40}$/i.test(value) &&
  !/^0+$/.test(value);
function eventRange(eventName, event) {
  const base =
    eventName === 'pull_request'
      ? event.pull_request?.base?.sha
      : eventName === 'push'
        ? event.before
        : null;
  const head =
    eventName === 'pull_request'
      ? event.pull_request?.head?.sha
      : eventName === 'push'
        ? event.after
        : null;
  return validSha(base) && validSha(head) ? { base, head } : null;
}
function hasCommit(sha, cwd) {
  const result = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
    cwd,
    stdio: 'pipe',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}
export function readGitChangedPaths(base, head, cwd = process.cwd()) {
  // Disabling rename detection includes both the removed and added path in a move.
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', base, head, '--'],
    { cwd, encoding: 'utf8' },
  );
  return output.split('\0').filter(Boolean);
}
export function selectEventModules(eventName, event, cwd = process.cwd()) {
  const range = eventRange(eventName, event);
  if (!range)
    return {
      modules: allModules(),
      reason: 'No usable base/head range',
      paths: [],
    };
  if (!hasCommit(range.head, cwd))
    throw new Error(`Checkout does not contain head commit ${range.head}`);
  if (!hasCommit(range.base, cwd))
    return {
      modules: allModules(),
      reason: 'Base commit is unavailable; run every module',
      ...range,
      paths: [],
    };
  // GitHub PR path filters compare the topic against its merge base; pushes compare snapshots.
  const comparisonBase =
    eventName === 'pull_request'
      ? execFileSync('git', ['merge-base', range.base, range.head], {
          cwd,
          encoding: 'utf8',
        }).trim()
      : range.base;
  const paths = readGitChangedPaths(comparisonBase, range.head, cwd);
  return {
    modules: selectChangedModules(paths),
    reason: 'Changed paths',
    ...range,
    paths,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.env.GITHUB_EVENT_PATH)
    throw new Error('GITHUB_EVENT_PATH is required');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const selected = selectEventModules(process.env.GITHUB_EVENT_NAME, event);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(selected.modules)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  process.stdout.write(`${JSON.stringify(selected)}\n`);
}
