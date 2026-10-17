import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const resvgRoot = dirname(require.resolve('@resvg/resvg-js/package.json'));
// The generated loader also lists fallback targets not published as optional
// packages. Take its literal native candidates, not arbitrary missing imports.
const resvgCandidates = Array.from(
  readFileSync(join(resvgRoot, 'js-binding.js'), 'utf8').matchAll(
    /require\(["'](@resvg\/resvg-js-[^"']+|\.\/resvgjs\.[^"']+\.node)["']\)/g,
  ),
  (match) => match[1],
);
const sqliteRoot = dirname(require.resolve('better-sqlite3/package.json'));
const authRequire = createRequire(require.resolve('better-auth/crypto'));
const coreRoot = dirname(dirname(authRequire.resolve('@better-auth/core')));
const core = JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8'));

// These loaders try alternatives. Missing candidates are expected only after
// the packaged modules' actual native bindings have been loaded successfully.
const optionalCandidates = new Map([
  [join(resvgRoot, 'js-binding.js'), new Set(resvgCandidates)],
  [
    join(sqliteRoot, 'lib/binding.js'),
    new Set(
      ['Debug', 'Release'].map((mode) =>
        join(sqliteRoot, 'build', mode, 'better_sqlite3.node'),
      ),
    ),
  ],
  [
    join(coreRoot, 'dist/instrumentation/api.mjs'),
    new Set(
      core.peerDependenciesMeta?.['@opentelemetry/api']?.optional
        ? ['@opentelemetry/api']
        : [],
    ),
  ],
]);

export function partitionTraceWarnings(warnings) {
  const expected = [];
  const unexpected = [];
  for (const warning of new Map(
    Array.from(warnings, (warning) => [warning.message, warning]),
  ).values()) {
    const missing = warning.message.match(
      /^Failed to resolve dependency "([^"]+)":\nCannot find module '[^']+' loaded from (.+)$/,
    );
    if (missing && optionalCandidates.get(missing[2])?.has(missing[1]))
      expected.push(warning);
    else unexpected.push(warning);
  }
  return { expected, unexpected };
}

export function verifyStandaloneNativeBindings(output) {
  const packageRoot = realpathSync(output);
  const runtimeRequire = createRequire(join(packageRoot, 'package.json'));
  const Database = runtimeRequire('better-sqlite3');
  new Database(':memory:').close();
  const { Resvg } = runtimeRequire('@resvg/resvg-js');
  new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
    .render()
    .asPng();

  for (const name of ['better-sqlite3', '@resvg/resvg-js']) {
    const visited = new Set();
    const pending = [runtimeRequire.cache[runtimeRequire.resolve(name)]];
    while (pending.length) {
      const loaded = pending.pop();
      if (visited.has(loaded)) continue;
      visited.add(loaded);
      pending.push(...loaded.children);
    }
    const bindings = [...visited].filter((loaded) =>
      loaded.filename.endsWith('.node'),
    );
    if (bindings.length === 0)
      throw new Error(`Standalone native binding not loaded: ${name}`);
    for (const binding of bindings) {
      const path = relative(packageRoot, binding.filename);
      if (path.startsWith('../') || isAbsolute(path))
        throw new Error(
          `Standalone native binding resolved outside package: ${binding.filename}`,
        );
    }
  }
}
