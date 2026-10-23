import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => ({
  start: vi.fn(),
  held: vi.fn(),
  ready: vi.fn(),
  provider: vi.fn(),
  remote: vi.fn(),
}));
vi.mock('../../../scripts/browser-backup-s3.mjs', () => ({
  loadBackupBrowserProvider: effects.provider,
  createBackupBrowserS3: effects.remote,
}));
vi.mock('../../../tests/integration/backup/production-fixture.ts', () => ({
  backupTestOwner: { email: 'backup@example.test' },
  startBackupProductionInstance: effects.start,
  heldPublicUpload: effects.held,
  waitForBackupJob: effects.ready,
  expectHttp: async (response: Response, status: number) => {
    expect(response.status).toBe(status);
    return response;
  },
  httpJson: async (response: Response, status: number) => {
    expect(response.status).toBe(status);
    return response.json();
  },
  waitUntil: async (
    read: () => unknown,
    accepted: (value: unknown) => boolean,
  ) => {
    expect(accepted(await read())).toBe(true);
  },
}));
vi.mock('better-sqlite3', () => ({
  default: class {
    prepare() {
      return { get: () => ({ count: 1 }) };
    }
    close() {}
  },
}));
import { runBackupBrowser } from '../../../scripts/browser-backup.mjs';

const directories: string[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const output = await mkdtemp(join(tmpdir(), 'backup-browser-unit-'));
  directories.push(output);
  const order: string[] = [];
  const response = (body: object, status: number) =>
    Response.json(body, { status });
  const source = {
    origin: 'http://127.0.0.1:41000',
    dataDir: '/controlled-fixture-data',
    application: { version: '1.2.0-test', revision: 'fixture' },
    initialize: vi.fn(),
    login: vi.fn(),
    diagnostics: () => [],
    ownerJson: vi.fn(async (path: string) => {
      if (path === '/api/upload-tokens')
        return response({ key: 'fixture-token' }, 200);
      if (path === '/api/albums')
        return response({ album: { id: 'album' } }, 201);
      if (path === '/api/tags') return response({ tag: { id: 'tag' } }, 201);
      return response({}, 200);
    }),
    request: vi.fn(async () =>
      response(
        {
          imageId: 'image',
          versions: {
            thumbnail: {},
            original: { url: 'http://127.0.0.1:41000/i/image?type=original' },
          },
        },
        201,
      ),
    ),
    removeData: vi.fn(async () => {
      order.push('remove-source');
    }),
    close: vi.fn(async () => {
      order.push('close-source');
    }),
  };
  const target = {
    origin: 'http://127.0.0.1:41001',
    setupCode: () => 'fixture-setup-code',
    diagnostics: () => [],
    restart: vi.fn(async () => {
      order.push('restart-target');
    }),
    close: vi.fn(async () => {
      order.push('close-target');
    }),
  };
  effects.start.mockResolvedValueOnce(source).mockResolvedValueOnce(target);
  const held = {
    settled: false,
    response: Promise.resolve(response({ imageId: 'late-image' }, 201)),
    release: vi.fn(() => {
      order.push('release-upload');
    }),
    abort: vi.fn(),
  };
  effects.held.mockReturnValue(held);
  effects.ready.mockImplementation(async () => {
    order.push('backup-ready');
  });
  const scenes: Record<string, unknown>[] = [];
  const runBrowser = vi.fn(
    async (_script: string, config: Record<string, unknown>) => {
      scenes.push(config);
      order.push(String(config.phase));
      if (config.phase === 'download')
        await writeFile(String(config.download), 'controlled fixture');
      await writeFile(
        join(output, `backup-${config.phase}.json`),
        JSON.stringify({ status: 'passed', backupId: 'backup-id' }),
      );
    },
  );
  const input = {
    spaceId: 8,
    pageLabel: 'p2',
    output,
    runBrowser,
    signal: new AbortController().signal,
    secrets: [] as string[],
  };
  return { input, source, target, held, order, scenes };
}

describe('backup browser two-instance lifecycle', () => {
  it('passes remote targets only to restoration, includes every image at activation and cleans remote scopes after the instances stop', async () => {
    const { input, order, scenes } = await fixture();
    const restoreTargets = ['s3-one', 's3-two'].map((storageId) => ({
      storageId,
      confirmR2: true,
      value: {
        endpoint: 'https://r2.example.test',
        accessKey: 'provider-key',
        secretKey: 'provider-secret',
      },
    }));
    const remote = {
      report: { service: 'r2' },
      restoreTargets,
      imageIds: ['remote-image-one', 'remote-image-two'],
      prepare: vi.fn(async () => {
        order.push('prepare-remote');
      }),
      removeSource: vi.fn(async () => {
        order.push('remove-remote-source');
      }),
      verifyAfterRestore: vi.fn(async () => {
        order.push('check-sentinel');
      }),
      close: vi.fn(async () => {
        order.push('close-remote');
      }),
    };
    effects.provider.mockResolvedValue({
      credentials: {
        accessKeyId: 'provider-key',
        secretAccessKey: 'provider-secret',
      },
    });
    effects.remote.mockReturnValue(remote);
    await runBackupBrowser({
      ...input,
      storageConfig: '/private/provider.json',
    });
    expect(effects.provider).toHaveBeenCalledWith('/private/provider.json');
    expect(scenes[0]).not.toHaveProperty('restoreTargets');
    expect(scenes[2]).toMatchObject({ restoreTargets });
    expect(scenes[3]).toMatchObject({
      imageIds: ['image', 'remote-image-one', 'remote-image-two', 'late-image'],
      remoteStorageIds: ['s3-one', 's3-two'],
    });
    expect(order.indexOf('remove-remote-source')).toBeLessThan(
      order.indexOf('restore'),
    );
    expect(order.slice(-3)).toEqual([
      'close-source',
      'close-target',
      'close-remote',
    ]);
    expect(input.secrets).toContain('provider-secret');
    expect(remote.close).toHaveBeenCalledOnce();
  });
  it('cleans already registered remote targets on scene failure and redacts provider secrets in the failure report', async () => {
    const { input, source, target } = await fixture();
    effects.provider.mockResolvedValue({
      credentials: {
        accessKeyId: 'provider-key',
        secretAccessKey: 'provider-secret',
      },
    });
    const close = vi.fn();
    effects.remote.mockReturnValue({
      report: { scopes: [] },
      prepare: vi
        .fn()
        .mockRejectedValue(new Error('probe failed provider-secret')),
      close,
    });
    await expect(
      runBackupBrowser({ ...input, storageConfig: '/private/provider.json' }),
    ).rejects.toThrow('probe failed');
    expect(close).toHaveBeenCalledOnce();
    expect(source.close).toHaveBeenCalledOnce();
    expect(target.close).toHaveBeenCalledOnce();
    const report = await readFile(join(input.output, 'backup.json'), 'utf8');
    expect(report).toContain('[redacted]');
    expect(report).not.toContain('provider-secret');
    expect(input.runBrowser).not.toHaveBeenCalled();
  });
  it('downloads before removing source data, restores from that file, then restarts before activation checks', async () => {
    const { input, source, target, held, order, scenes } = await fixture();
    await runBackupBrowser(input);
    expect(order).toEqual([
      'create',
      'release-upload',
      'backup-ready',
      'download',
      'remove-source',
      'restore',
      'restart-target',
      'activated',
      'close-source',
      'close-target',
    ]);
    expect(
      scenes.every((scene) => scene.spaceId === 8 && scene.pageLabel === 'p2'),
    ).toBe(true);
    expect(scenes[2]).toMatchObject({
      publicPath: '/i/image?type=original',
      setupCode: 'fixture-setup-code',
      targetOrigin: 'http://localhost:41001',
      download: join(input.output, 'backup.age'),
    });
    expect(scenes[3]).toMatchObject({ imageIds: ['image', 'late-image'] });
    expect(source.close).toHaveBeenCalledOnce();
    expect(target.close).toHaveBeenCalledOnce();
    expect(held.abort).toHaveBeenCalledOnce();
    const report = await readFile(join(input.output, 'backup.json'), 'utf8');
    expect(JSON.parse(report)).toMatchObject({
      status: 'passed',
      cleanup: 'passed',
    });
    expect(report).not.toContain('fixture-setup-code');
  });

  it('aborts admitted uploads and removes both fixtures after a browser failure without advancing', async () => {
    const { input, source, target, held } = await fixture();
    input.runBrowser.mockRejectedValueOnce(
      new Error('Browser control unavailable'),
    );
    await expect(runBackupBrowser(input)).rejects.toThrow(
      'Browser control unavailable',
    );
    expect(held.abort).toHaveBeenCalledOnce();
    expect(held.release).not.toHaveBeenCalled();
    expect(source.close).toHaveBeenCalledOnce();
    expect(target.close).toHaveBeenCalledOnce();
    expect(target.restart).not.toHaveBeenCalled();
    expect(input.runBrowser).toHaveBeenCalledOnce();
    expect(
      JSON.parse(await readFile(join(input.output, 'backup.json'), 'utf8')),
    ).toMatchObject({ status: 'failed', cleanup: 'passed' });
  });

  it('closes the already started source if starting the target fails', async () => {
    const { input, source } = await fixture();
    effects.start
      .mockReset()
      .mockResolvedValueOnce(source)
      .mockRejectedValueOnce(new Error('Target startup failed'));
    await expect(runBackupBrowser(input)).rejects.toThrow(
      'Target startup failed',
    );
    expect(source.close).toHaveBeenCalledOnce();
    expect(input.runBrowser).not.toHaveBeenCalled();
  });

  it('reports cleanup failures and still attempts to close the other instance', async () => {
    const { input, source, target } = await fixture();
    source.close.mockRejectedValueOnce(new Error('Source cleanup failed'));
    await expect(runBackupBrowser(input)).rejects.toThrow(
      'fixture cleanup failed',
    );
    expect(target.close).toHaveBeenCalledOnce();
    expect(
      JSON.parse(await readFile(join(input.output, 'backup.json'), 'utf8')),
    ).toMatchObject({
      status: 'failed',
      cleanup: 'failed',
      cleanupErrors: ['Error: Source cleanup failed'],
    });
  });
});
