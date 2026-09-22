import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createConnection, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { execa } from 'execa';
import {
  initialMigration,
  upgradeMigration,
  brokenMigration,
  writeMigrations,
} from '../tests/fixtures/runtime/migrations.ts';

export function parseRecords(logs) {
  const records = logs
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(records.length > 0, 'container must emit JSON logs');
  for (const record of records) {
    assert.equal(typeof record.msg, 'string');
    assert.ok(
      ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(
        record.level,
      ),
      'valid log level',
    );
    assert.equal(typeof record.module, 'string');
    assert.ok(record.module.length > 0, 'log module is required');
    assert.match(record.time, /^\d{4}-\d{2}-\d{2}T/);
  }
  return records;
}

export function containerEnvironment(environment) {
  const isolated = { ...environment };
  for (const key of ['BETTER_AUTH_SECRET', 'ARISO_ENCRYPTION_KEY', 'LOG_LEVEL'])
    delete isolated[key];
  return isolated;
}

export async function assertPortClosed(port) {
  await new Promise((accept, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error('TCP probe timed out; listener state is unknown'));
    });
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error('migration failure must not open a TCP listener'));
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') accept();
      else reject(error);
    });
  });
}

function redactSetupCodes(logs) {
  return logs.replace(/^(.*)$/gm, (line) => {
    try {
      const record = JSON.parse(line);
      if (record.module === 'identity.setup' && record.event === 'setup-code')
        return JSON.stringify({ ...record, code: '[Redacted]' });
    } catch {
      // Preserve non-JSON diagnostics when reporting a failed container.
    }
    return line;
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      image: { type: 'string' },
      platform: { type: 'string' },
      'output-dir': { type: 'string' },
    },
  });
  assert.ok(values.image, '--image is required');
  if (values.platform) assert.match(values.platform, /^linux\/(amd64|arm64)$/);
  const root = await mkdtemp(join(tmpdir(), 'ariso-container-'));
  const project = `ariso-check-${randomBytes(6).toString('hex')}`;
  const data = join(root, 'data');
  const envFile = join(root, 'test.env');
  const override = join(root, 'override.yaml');
  const report = {
    image: values.image,
    platform: values.platform,
    host: `${process.platform}/${process.arch}`,
    failureNetwork: 'Linux Docker host network; direct loopback TCP probe',
    backupMethod:
      'stopped whole-directory tar -cpf archive; restore with tar -xpf',
    checks: [],
    stops: [],
    status: 'running',
  };
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const docker = (args, options = {}) =>
    execa('docker', args, {
      timeout: 120000,
      env: containerEnvironment(process.env),
      extendEnv: false,
      cancelSignal: abort.signal,
      ...options,
    });
  const composeArgs = [
    'compose',
    '--project-name',
    project,
    '--env-file',
    envFile,
    '-f',
    resolve('compose.yaml'),
    '-f',
    override,
  ];
  const compose = (args) => docker([...composeArgs, ...args]);
  const platformArgs = values.platform ? ['--platform', values.platform] : [];
  const socket = createServer();
  await new Promise((accept, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', accept);
  });
  const port = socket.address().port;
  await new Promise((accept, reject) =>
    socket.close((error) => (error ? reject(error) : accept())),
  );
  let id;
  let origin = `http://127.0.0.1:${port}`;
  let configured = false;
  const check = (name) => {
    report.checks.push(name);
    console.log(`PASS ${name}`);
  };
  async function configure(migrations, failure = false) {
    const volumes = [{ type: 'bind', source: data, target: '/data' }];
    if (migrations)
      volumes.push({
        type: 'bind',
        source: migrations,
        target: '/app/drizzle',
        read_only: true,
      });
    const service = {
      image: values.image,
      ...(values.platform ? { platform: values.platform } : {}),
      ports: failure
        ? []
        : [{ target: 3000, host_ip: '127.0.0.1', published: String(port) }],
      volumes,
    };
    // Compose override replaces the sample's host port and data directory entirely.
    await writeFile(
      override,
      `services:\n  ariso:\n    image: ${JSON.stringify(service.image)}\n${service.platform ? `    platform: ${JSON.stringify(service.platform)}\n` : ''}    ports: !override ${JSON.stringify(service.ports)}\n    volumes: !override ${JSON.stringify(service.volumes)}\n${failure ? `    network_mode: host\n    environment:\n      HOST: 127.0.0.1\n      PORT: '${port}'\n` : ''}`,
    );
    configured = true;
  }
  async function inspect() {
    return JSON.parse((await docker(['inspect', id])).stdout)[0];
  }
  async function start(healthy = true) {
    await compose([
      'up',
      '--detach',
      '--no-build',
      '--pull',
      'never',
      '--force-recreate',
    ]);
    id = (await compose(['ps', '--all', '--quiet', 'ariso'])).stdout.trim();
    assert.ok(id);
    if (healthy) await waitHealthy();
  }
  async function waitHealthy() {
    for (let attempt = 0; attempt < 90; attempt++) {
      const container = await inspect();
      assert.equal(
        container.State.Running,
        true,
        JSON.stringify(container.State),
      );
      if (container.State.Health.Status === 'healthy') {
        const response = await fetch(`${origin}/api/health`, {
          signal: AbortSignal.timeout(3000),
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      }
      await delay(1000, undefined, { signal: abort.signal });
    }
    throw new Error('container health timeout');
  }
  async function logs(name) {
    const result = await docker(['logs', id]);
    const text = `${result.stdout}\n${result.stderr}`.trim();
    if (values['output-dir'])
      await writeFile(
        join(values['output-dir'], `${name}.jsonl`),
        `${redactSetupCodes(text)}\n`,
      );
    return parseRecords(text);
  }
  async function exec(code) {
    return JSON.parse((await docker(['exec', id, 'node', '-e', code])).stdout);
  }
  async function rows() {
    return exec(
      `const D=require('better-sqlite3');const d=new D('/data/ariso.db');console.log(JSON.stringify({rows:d.prepare('SELECT value FROM sample ORDER BY rowid').all(),migrations:d.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get().n}));d.close()`,
    );
  }
  async function assertSingleWebProcess() {
    const mainPid = (await inspect()).State.Pid;
    const deadline = Date.now() + 5000;
    let processes;
    do {
      // Docker's Node healthcheck is short-lived; it is not a second Web server.
      processes = (await docker(['top', id, '-eo', 'pid,comm'])).stdout
        .trim()
        .split('\n')
        .slice(1);
      if (processes.length === 1) {
        assert.equal(Number(processes[0].trim().split(/\s+/)[0]), mainPid);
        return;
      }
      await delay(100, undefined, { signal: abort.signal });
    } while (Date.now() < deadline);
    assert.fail(`extra container processes remain: ${processes.join('\n')}`);
  }
  async function stop() {
    const began = Date.now();
    await compose(['stop', 'ariso']);
    const state = (await inspect()).State;
    assert.equal(state.Running, false);
    assert.equal(state.Pid, 0);
    const elapsedMs = Date.now() - began;
    report.stops.push({ exitCode: state.ExitCode, elapsedMs });
    // Next 16.3.5 completes SIGTERM cleanup and exits with 128 + 15.
    assert.equal(state.ExitCode, 143, 'Next SIGTERM cleanup exit code');
    assert.ok(elapsedMs < 30000, 'stop before grace period');
  }
  async function failed(code) {
    await start(false);
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = (await inspect()).State;
      // Probe while prestart is running as well as after exit.
      await assertPortClosed(port);
      if (!state.Running) {
        assert.notEqual(state.ExitCode, 0);
        const records = await logs(code);
        assert.ok(records.some((r) => JSON.stringify(r).includes(code)));
        assert.ok(!records.some((r) => r.msg.includes('Next.js')));
        check(code);
        return;
      }
      await delay(100, undefined, { signal: abort.signal });
    }
    throw new Error(`${code}: failed container did not exit`);
  }
  async function ownData() {
    await docker(
      [
        'run',
        '--rm',
        ...platformArgs,
        '--user',
        '0',
        '--volume',
        `${data}:/data`,
        '--entrypoint',
        'chown',
        values.image,
        '-R',
        `${process.getuid()}:${process.getgid()}`,
        '/data',
      ],
      { cancelSignal: undefined },
    );
  }
  try {
    if (values['output-dir'])
      await mkdir(values['output-dir'], { recursive: true });
    await mkdir(data);
    await chmod(data, 0o777);
    await writeFile(
      envFile,
      `BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\nARISO_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nLOG_LEVEL=info\n`,
      { mode: 0o600 },
    );
    await configure();
    await compose(['config', '--quiet']);
    const image = JSON.parse(
      (await docker(['image', 'inspect', values.image])).stdout,
    )[0];
    report.imageId = image.Id;
    report.imageArchitecture = image.Architecture;
    if (values.platform)
      assert.equal(`linux/${image.Architecture}`, values.platform);
    await start();
    const actual = await exec(
      `console.log(JSON.stringify({arch:process.arch,version:process.version,pid1:require('fs').readlinkSync('/proc/1/exe')}))`,
    );
    assert.equal(actual.arch, image.Architecture === 'amd64' ? 'x64' : 'arm64');
    assert.match(actual.version, /^v24\./);
    assert.match(actual.pid1, /\/node$/);
    await assertSingleWebProcess();
    const home = await fetch(origin);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.ok(html.includes('首次使用，请完成站点初始化。'));
    assert.match(html, /<a\b[^>]*href="\/setup"/);
    const scripts = [...html.matchAll(/src="([^" ]+\.js[^" ]*)"/g)].map(
      (m) => m[1],
    );
    assert.ok(scripts.length > 0);
    for (const path of ['/runtime.svg', ...scripts]) {
      const response = await fetch(new URL(path, origin));
      assert.equal(response.status, 200, path);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
    for (const path of [
      '/verification/fixtures/sample.jpg',
      '/verification/fixtures/sample.png',
      '/sample.jpg',
      '/sample.png',
    ]) {
      assert.equal((await fetch(new URL(path, origin))).status, 404, path);
    }
    const records = await logs('startup');
    assert.ok(
      records.some(
        (r) =>
          r.module === 'runtime.prestart' && r.msg === 'prestart completed',
      ),
    );
    check(
      'final image health, JSON logs, static assets, Node 24 architecture and PID 1',
    );
    const setupCodes = (entries) =>
      entries.filter(
        (entry) =>
          entry.module === 'identity.setup' && entry.event === 'setup-code',
      );
    assert.equal(setupCodes(records).length, 1);
    const setupCode = setupCodes(records)[0].code;
    assert.ok(
      typeof setupCode === 'string' && /^[A-Za-z0-9_-]{32}$/.test(setupCode),
    );
    const credentials = {
      email: 'container-owner@example.test',
      password: randomBytes(24).toString('base64url'),
    };
    const post = (path, body) =>
      fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
    const payload = {
      ...credentials,
      code: setupCode,
      publicUrl: origin,
      timeZone: 'UTC',
    };
    const denied = await post('/api/setup', { ...payload, code: 'wrong' });
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).code, 'INVALID_SETUP_CODE');
    const completed = await post('/api/setup', payload);
    assert.equal(completed.status, 200);
    assert.ok(
      completed.headers.get('set-cookie') === null,
      'setup must not create a cookie',
    );
    assert.equal(completed.headers.get('cache-control'), 'no-store');
    const completedBody = await completed.text();
    assert.ok(!completedBody.includes(setupCode));
    assert.ok(!completedBody.includes(credentials.password));
    assert.deepEqual(JSON.parse(completedBody), {
      code: 'SETUP_COMPLETED',
      redirectTo: '/login',
    });
    const login = await post('/api/auth/sign-in/email', credentials);
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(
      cookie.includes('session_token='),
      'login creates session cookie',
    );
    const session = await fetch(`${origin}/api/auth/get-session`, {
      headers: { cookie },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.email, credentials.email);
    const beforeRestart = setupCodes(await logs('setup-completed')).length;
    assert.equal(beforeRestart, 1);
    await compose(['restart', 'ariso']);
    origin = `http://127.0.0.1:${(await inspect()).NetworkSettings.Ports['3000/tcp'][0].HostPort}`;
    await waitHealthy();
    assert.equal(
      setupCodes(await logs('setup-restarted')).length,
      beforeRestart,
    );
    const repeated = await post('/api/setup', payload);
    assert.equal(repeated.status, 409);
    assert.ok(
      repeated.headers.get('set-cookie') === null,
      'completed setup retry must not create a cookie',
    );
    assert.equal((await repeated.json()).code, 'SETUP_ALREADY_COMPLETED');
    check(
      'production setup rejects wrong code, commits without session, supports login and stays completed after restart',
    );
    await stop();
    // 保留镜像的真实迁移，再追加测试迁移；不能以空生产 journal 为前提。
    const baselineFolder = join(root, 'baseline');
    await docker(['cp', `${id}:/app/drizzle`, baselineFolder]);
    const journal = JSON.parse(
      await readFile(join(baselineFolder, 'meta/_journal.json'), 'utf8'),
    );
    const baseline = await Promise.all(
      journal.entries.map(async (entry) => ({
        tag: entry.tag,
        when: entry.when,
        sql: await readFile(join(baselineFolder, `${entry.tag}.sql`), 'utf8'),
      })),
    );
    const latest = Math.max(0, ...baseline.map((entry) => entry.when));
    const samples = [initialMigration, upgradeMigration, brokenMigration].map(
      (entry) => ({
        ...entry,
        when: latest + entry.when,
      }),
    );
    const initial = writeMigrations(join(root, 'initial'), [
      ...baseline,
      samples[0],
    ]);
    const upgrade = writeMigrations(join(root, 'upgrade'), [
      ...baseline,
      ...samples.slice(0, 2),
    ]);
    const broken = writeMigrations(join(root, 'broken'), [
      ...baseline,
      ...samples,
    ]);
    await configure(initial);
    await start();
    await exec(
      `const D=require('better-sqlite3');const d=new D('/data/ariso.db');d.prepare('INSERT INTO sample VALUES (?)').run('persisted');d.close();require('fs').writeFileSync('/data/storage/probe.txt','storage backup');console.log('null')`,
    );
    const expected = {
      rows: [{ value: 'original' }, { value: 'persisted' }],
      migrations: baseline.length + 1,
    };
    assert.deepEqual(await rows(), expected);
    await stop();
    await compose(['start', 'ariso']);
    origin = `http://127.0.0.1:${(await inspect()).NetworkSettings.Ports['3000/tcp'][0].HostPort}`;
    await waitHealthy();
    assert.deepEqual(await rows(), expected);
    await compose(['restart', 'ariso']);
    origin = `http://127.0.0.1:${(await inspect()).NetworkSettings.Ports['3000/tcp'][0].HostPort}`;
    await waitHealthy();
    assert.deepEqual(await rows(), expected);
    await assertSingleWebProcess();
    check('stop/start/restart persistence and repeated migrations');
    await stop();
    await execa('tar', ['-C', data, '-cpf', join(root, 'backup.tar'), '.']);
    await chmod(data, 0o777);
    await configure(upgrade);
    await start();
    assert.deepEqual(await rows(), {
      rows: [...expected.rows, { value: 'upgrade' }],
      migrations: baseline.length + 2,
    });
    await logs('upgrade');
    await stop();
    // Linux host networking bypasses docker-proxy for the no-listener assertion.
    await configure(broken, true);
    await failed('MIGRATION_FAILED');
    await configure(upgrade);
    await start();
    assert.equal((await rows()).migrations, baseline.length + 2);
    assert.equal(
      await exec(
        `const D=require('better-sqlite3');const d=new D('/data/ariso.db');console.log(JSON.stringify(d.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='rolled_back'").get().n));d.close()`,
      ),
      0,
    );
    await stop();
    await configure(initial, true);
    await failed('SCHEMA_TOO_NEW');
    check(
      'upgrade data preserved, failed migration rolled back and old schema refused',
    );
    await compose(['down', '--volumes', '--remove-orphans']);
    await ownData();
    await rm(data, { recursive: true });
    await mkdir(data);
    await execa('tar', ['-C', data, '-xpf', join(root, 'backup.tar')]);
    // Restore ownership for the image's node user after host-side backup copying.
    await docker([
      'run',
      '--rm',
      ...platformArgs,
      '--user',
      '0',
      '--volume',
      `${data}:/data`,
      '--entrypoint',
      'chown',
      values.image,
      '-R',
      '1000:1000',
      '/data',
    ]);
    await configure(initial);
    await start();
    assert.deepEqual(await rows(), expected);
    assert.equal(
      await readFile(join(data, 'storage/probe.txt'), 'utf8'),
      'storage backup',
    );
    await logs('restored');
    await stop();
    check(
      'stopped whole-directory backup and restore before old-version startup',
    );
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    if (id) {
      const result = await execa('docker', ['logs', id], { reject: false });
      console.error(
        redactSetupCodes(result.stdout),
        redactSetupCodes(result.stderr),
      );
    }
    throw error;
  } finally {
    try {
      if (configured)
        await docker(
          [...composeArgs, 'down', '--volumes', '--remove-orphans'],
          { timeout: 60000, cancelSignal: undefined },
        );
      const remaining = await execa('docker', [
        'ps',
        '--all',
        '--quiet',
        '--filter',
        `label=com.docker.compose.project=${project}`,
      ]);
      assert.equal(
        remaining.stdout.trim(),
        '',
        'no verification container left',
      );
      await ownData();
      await rm(root, { recursive: true, force: true });
      report.cleaned = true;
    } catch (error) {
      report.status = 'failed';
      report.cleanupError = error.message;
      throw error;
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      if (values['output-dir'])
        await writeFile(
          join(values['output-dir'], 'report.json'),
          `${JSON.stringify(report, null, 2)}\n`,
        );
      console.log(JSON.stringify(report, null, 2));
    }
  }
}

if (import.meta.main) await main();
