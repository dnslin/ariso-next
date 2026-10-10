// Replace only the CLI's external effects. Its plan, stage helpers and loops run unchanged.
import { EventEmitter } from 'node:events';
import { appendFileSync } from 'node:fs';
import * as files from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const runner = new URL(
  '../../../../scripts/verify-browser.mjs',
  import.meta.url,
).href;
const trace = (event) =>
  appendFileSync(process.env.BROWSER_CLI_TRACE, `${JSON.stringify(event)}\n`);
const children = new Map();
const initialized = new Set();
let nextPid = 100000;

function close(child) {
  child.exitCode = 0;
  children.delete(child.pid);
  child.emit('close', 0);
}

export function spawn(command, args, options = {}) {
  const child = Object.assign(new EventEmitter(), {
    pid: nextPid++,
    exitCode: null,
    signalCode: null,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: new EventEmitter(),
  });
  children.set(child.pid, child);
  child.stdin.end = (source) => {
    const configLine = source.slice(0, source.indexOf('\n'));
    const config = JSON.parse(configLine.slice('const config = '.length, -1));
    const script = source.split('\n')[1].slice('// CLI scene: '.length);
    trace({
      kind: 'browser',
      script,
      dataDirectory: config.dataDirectory,
      passwordResetPhase: config.passwordResetPhase,
      siteBrandingPhase: config.siteBrandingPhase,
      themePhase: config.themePhase,
      hasPasswordResetFixture: !!config.passwordResetFixture,
    });
    setImmediate(() => close(child));
  };
  if (command === 'sh') {
    const dataDirectory = options.env.DATA_DIR;
    trace({ kind: 'runtime', dataDirectory });
    if (!initialized.has(dataDirectory)) {
      initialized.add(dataDirectory);
      setImmediate(() =>
        child.stdout.emit(
          'data',
          `${JSON.stringify({ module: 'identity.setup', event: 'setup-code', code: 'fixture-code' })}\n`,
        ),
      );
    }
  } else if (args[0] === 'run-browser.mjs') {
    setImmediate(() => close(child));
  }
  return child;
}

// No process exists: SIGTERM completes the recorded substitute child.
process.kill = (pid) => {
  const child = children.get(-pid);
  if (child) setImmediate(() => close(child));
  return true;
};
globalThis.fetch = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  return new Response('{}', { status: 200 });
};

export function createServer() {
  const server = new EventEmitter();
  server.listen = () => {
    setImmediate(() => server.emit('listening'));
    return server;
  };
  server.address = () => ({ port: 43210 });
  server.close = (callback) => callback();
  return server;
}

export async function readFile(path, encoding) {
  const pathname = path instanceof URL ? fileURLToPath(path) : path;
  if (pathname === '/fixture-ca' || pathname === '/fixture-reset-ca')
    return 'CLI fixture SMTP certificate';
  const source = await files.readFile(path, encoding);
  return pathname.includes('/e2e/')
    ? `// CLI scene: ${pathname.split('/').at(-1)}\n${source}`
    : source;
}

export const cp = async () => {};
export const startCorsFixture = async () => ({
  endpoint: 'http://fixture',
  close: async () => {},
});
export const startSmtpBrowserFixture = async () => ({
  caPath: '/fixture-ca',
  browserInput: { password: 'fixture' },
  close: async () => {},
});
export const startPasswordResetBrowserFixture = async () => ({
  caPath: '/fixture-reset-ca',
  browserInput: { targets: {}, control: 'http://fixture-reset' },
  close: async () => {},
});
export const launchProtocolDelivery = async () => ({
  browserInput: { credentials: { password: 'fixture' } },
  close: async () => {},
});
export const startUploadEndpoint = async () => {
  throw new Error('Unexpected S3 fixture');
};
export const runBrandBrowser = async () => {};
export const runBrandingBrowser = async ({ spaceId, pageLabel }) => {
  trace({ kind: 'branding', spaceId, pageLabel });
};
export const createSharingRunner = () =>
  Object.fromEntries(
    ['runViewer', 'runPublic', 'runProtocol', 'runExperiment', 'stop'].map(
      (name) => [name, async () => {}],
    ),
  );

const substitutes = new Map([
  ['node:child_process', ['spawn']],
  ['node:net', ['createServer']],
  ['node:fs/promises', ['cp', 'readFile']],
  ['../e2e/storage-cors-fixture.mjs', ['startCorsFixture']],
  ['../e2e/smtp-fixture.mjs', ['startSmtpBrowserFixture']],
  ['../e2e/password-reset-fixture.mjs', ['startPasswordResetBrowserFixture']],
  ['../tests/integration/upload/s3-endpoint.ts', ['startUploadEndpoint']],
  ['../tests/integration/delivery/s3-fixture.ts', ['launchProtocolDelivery']],
  ['./browser-brand.mjs', ['runBrandBrowser']],
  ['./browser-branding.mjs', ['runBrandingBrowser']],
  ['./browser-sharing.mjs', ['createSharingRunner']],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === runner && substitutes.has(specifier))
      return { url: `cli-fixture:${specifier}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('cli-fixture:')) return nextLoad(url, context);
    const specifier = url.slice('cli-fixture:'.length);
    return {
      format: 'module',
      shortCircuit: true,
      source: `${specifier === 'node:fs/promises' ? "export { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';" : ''}\nexport { ${substitutes.get(specifier).join(', ')} } from '${import.meta.url}';`,
    };
  },
});
