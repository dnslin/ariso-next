import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createSharingRunner } from '../../../scripts/browser-sharing.mjs';

const launches = vi.hoisted(() => ({
  experiment: vi.fn(),
  protocol: vi.fn(),
  public: vi.fn(),
  viewer: vi.fn(),
}));
vi.mock('../../../tests/experiments/sharing/harness.ts', () => ({
  launchSharing: launches.experiment,
}));
vi.mock('../../../e2e/sharing-protocol-fixture.ts', () => ({
  launchSharingProtocol: launches.protocol,
}));
vi.mock('../../../e2e/sharing-public-fixture.mjs', () => ({
  launchSharingPublic: launches.public,
}));
vi.mock('../../../e2e/sharing-viewer-fixture.mjs', () => ({
  launchSharingViewer: launches.viewer,
}));

const outputs: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    outputs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const output = await mkdtemp(join(tmpdir(), 'ariso-sharing-runner-'));
  outputs.push(output);
  const signal = new AbortController().signal;
  const report: Record<string, unknown> = {};
  const secrets: string[] = [];
  const runBrowser = vi.fn().mockResolvedValue(undefined);
  const source = {
    origin: 'http://sharing.example.test',
    browserInput: {
      origin: 'http://sharing.example.test',
      password: 'public-password',
      credentials: { email: 'owner@example.test', password: 'owner-password' },
      tokens: ['protocol-token'],
      albums: { protected: { token: 'public-token' } },
    },
    logs: () =>
      'setup-code public-password owner-password protocol-token public-token sharing-protocol-password sharing-password sharing-experiment-password',
    verify: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  for (const launch of Object.values(launches))
    launch.mockResolvedValue(source);
  const runner = createSharingRunner({
    signal,
    runBrowser,
    pageLabel: 'p2',
    output,
    report,
    secrets,
    setupCodes: () => ['setup-code'],
    redact: (value: string) =>
      secrets.reduce(
        (safe, secret) => safe.replaceAll(secret, '[redacted]'),
        value,
      ),
  });
  return { runner, source, signal, report, secrets, runBrowser, output };
}

it('passes the public phase only to its own browser and verifies before stopping', async () => {
  const f = await fixture();
  await f.runner.runPublic(37, 'recovery');
  expect(launches.public).toHaveBeenCalledExactlyOnceWith(f.signal);
  expect(f.runBrowser).toHaveBeenCalledWith(
    '../e2e/sharing-public.mjs',
    expect.objectContaining({
      ...f.source.browserInput,
      sharingPublicPhase: 'recovery',
      spaceId: 37,
      pageLabel: 'p2',
      output: f.output,
      identitySessionScript: expect.stringMatching(/identity-session\.mjs$/),
      sharingErrorsScript: expect.stringMatching(/sharing-public-errors\.mjs$/),
    }),
    'sharing-public.log',
  );
  const input = f.runBrowser.mock.calls[0][1];
  expect(input).not.toHaveProperty('sharingManagementPhase');
  expect(input).not.toHaveProperty('tokensPhase');
  expect(f.source.verify).toHaveBeenCalledOnce();
  expect(f.source.verify.mock.invocationCallOrder[0]).toBeLessThan(
    f.source.stop.mock.invocationCallOrder[0],
  );
  expect(f.report.sharingPublic).toBe('passed');
  const log = await readFile(
    join(f.output, 'sharing-public-server.log'),
    'utf8',
  );
  for (const secret of f.secrets) expect(log).not.toContain(secret);
  await f.runner.stop();
  expect(f.source.stop).toHaveBeenCalledOnce();
});

it('keeps the default public flow without forcing a partial phase', async () => {
  const f = await fixture();
  await f.runner.runPublic(37);
  expect(f.runBrowser.mock.calls[0][1].sharingPublicPhase).toBeUndefined();
  expect(f.source.verify).toHaveBeenCalledOnce();
  expect(f.source.stop).toHaveBeenCalledOnce();
});

it('runs anonymous viewer checks with its own phase and fixture lifecycle', async () => {
  const f = await fixture();
  await f.runner.runViewer(37, 'race');
  expect(launches.viewer).toHaveBeenCalledExactlyOnceWith(f.signal);
  expect(launches.public).not.toHaveBeenCalled();
  expect(f.runBrowser).toHaveBeenCalledWith(
    '../e2e/sharing-viewer.mjs',
    expect.objectContaining({
      sharingViewerPhase: 'race',
      spaceId: 37,
      pageLabel: 'p2',
    }),
    'sharing-viewer.log',
  );
  expect(f.runBrowser.mock.calls[0][1]).not.toHaveProperty(
    'sharingPublicPhase',
  );
  expect(f.source.verify).toHaveBeenCalledOnce();
  expect(f.source.stop).toHaveBeenCalledOnce();
  expect(f.report.sharingViewer).toBe('passed');
  await f.runner.stop();
  expect(f.source.stop).toHaveBeenCalledOnce();
});

it('preserves protocol inputs and secret redaction independently from public phases', async () => {
  const f = await fixture();
  await f.runner.runProtocol(37);
  expect(launches.protocol).toHaveBeenCalledExactlyOnceWith(f.signal);
  expect(f.runBrowser).toHaveBeenCalledWith(
    '../e2e/sharing-protocol.mjs',
    {
      ...f.source.browserInput,
      spaceId: 37,
      pageLabel: 'p2',
      output: f.output,
    },
    'sharing-protocol.log',
  );
  expect(f.runBrowser.mock.calls[0][1]).not.toHaveProperty(
    'sharingPublicPhase',
  );
  expect(f.source.verify).toHaveBeenCalledOnce();
  expect(f.report.sharingProtocol).toBe('passed');
  const log = await readFile(
    join(f.output, 'sharing-protocol-server.log'),
    'utf8',
  );
  for (const secret of f.secrets) expect(log).not.toContain(secret);
  expect(f.source.stop).toHaveBeenCalledOnce();
});

it('keeps experiment scope and its unverified context boundary explicit', async () => {
  const f = await fixture();
  await f.runner.runExperiment(37);
  expect(launches.experiment).toHaveBeenCalledExactlyOnceWith(f.signal);
  expect(f.runBrowser).toHaveBeenCalledWith(
    '../tests/experiments/sharing/browser.mjs',
    { origin: f.source.origin, spaceId: 37, pageLabel: 'p2', output: f.output },
    'sharing-experiment.log',
  );
  expect(f.report).toMatchObject({
    sharingOrigin: f.source.origin,
    sharingExperiment: 'passed',
    sharingBrowserContexts: 'unverified',
  });
  expect(f.source.verify).not.toHaveBeenCalled();
  const log = await readFile(join(f.output, 'sharing-server.log'), 'utf8');
  for (const secret of f.secrets) expect(log).not.toContain(secret);
  expect(f.source.stop).toHaveBeenCalledOnce();
});

it.each(['browser', 'verify'])(
  'stops a public fixture when %s fails and retains failure',
  async (stage) => {
    const f = await fixture();
    const error = new Error(`${stage} failed`);
    (stage === 'browser' ? f.runBrowser : f.source.verify).mockRejectedValue(
      error,
    );
    await expect(f.runner.runPublic(37)).rejects.toBe(error);
    expect(f.report).not.toHaveProperty('sharingPublic');
    expect(f.source.stop).toHaveBeenCalledOnce();
    await expect(
      readFile(join(f.output, 'sharing-public-server.log')),
    ).resolves.toBeDefined();
    await f.runner.stop();
    expect(f.source.stop).toHaveBeenCalledOnce();
  },
);

it('keeps failed fixture cleanup owned for final shutdown and preserves its error context', async () => {
  const f = await fixture();
  const error = new Error('fixture process did not stop');
  f.source.stop.mockRejectedValue(error);
  await expect(f.runner.runPublic(37)).rejects.toBe(error);
  await expect(f.runner.stop()).rejects.toThrow('fixture process did not stop');
  f.source.stop.mockResolvedValue(undefined);
  await f.runner.stop();
  expect(f.source.stop).toHaveBeenCalledTimes(3);
  await f.runner.stop();
  expect(f.source.stop).toHaveBeenCalledTimes(3);
});
