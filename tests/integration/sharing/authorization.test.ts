import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  createAlbum,
  deleteAlbum,
} from '../../../src/server/collections/records.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { readShareAccess } from '../../../src/server/sharing/authorization.ts';
import {
  createShare,
  rotateShare,
  updateShare,
} from '../../../src/server/sharing/configuration.ts';
import {
  pruneShareGrants,
  startSharingRuntime,
} from '../../../src/server/sharing/runtime.ts';
import {
  albumShares,
  shareGrants,
} from '../../../src/server/sharing/schema.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';

// Keep Better Auth's real scrypt. The pause only makes concurrent owner writes
// deterministic after real verification and before the authorization transaction.
const verification = vi.hoisted(() => ({
  afterVerify: undefined as undefined | (() => Promise<void>),
}));
vi.mock('better-auth/crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('better-auth/crypto')>();
  return {
    ...original,
    verifyPassword: async (
      input: Parameters<typeof original.verifyPassword>[0],
    ) => {
      const verified = await original.verifyPassword(input);
      await verification.afterVerify?.();
      return verified;
    },
  };
});

const now = Date.parse('2026-10-05T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;
const password = ' Sharing password ';
const instant = (milliseconds: number) => new Date(milliseconds).toISOString();
let directory: string;
let databasePath: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: ReturnType<typeof startSharingRuntime> | undefined;
let logger: {
  info: Mock<Logger['info']>;
  error: Mock<Logger['error']>;
  debug: Mock<Logger['debug']>;
};
let releases: (() => void)[];

function start() {
  return (runtime ??= startSharingRuntime({
    db: connection.db,
    logger,
    now: () => new Date(),
  }));
}

async function unlock(token: string, value: string = password) {
  const result = await start().unlock(token, value);
  if (!('grantSecret' in result))
    throw new Error('带密码的分享验证成功后必须返回授权密钥');
  expect(result.grantSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return result;
}

async function seed(input: object = {}, value: string | null = password) {
  const album = connection.db.transaction((tx) =>
    createAlbum(tx, { name: 'Authorization test album', description: '' }),
  );
  return createShare(connection.db, album.id, {
    ...(value === null ? {} : { password: { action: 'set', value } }),
    ...input,
  });
}

function read(token: string, grantSecret?: string) {
  return connection.db.transaction((tx) =>
    readShareAccess(tx, { token, grantSecret, now: new Date() }),
  );
}

function grants() {
  return connection.db.select().from(shareGrants).all();
}

function record(id: string) {
  return connection.db
    .select()
    .from(albumShares)
    .where(eq(albumShares.id, id))
    .get()!;
}

function pauseVerification() {
  const released = Promise.withResolvers<void>();
  let entered = 0;
  const waiters: { count: number; resolve: () => void }[] = [];
  verification.afterVerify = async () => {
    entered++;
    for (const waiter of waiters) if (entered >= waiter.count) waiter.resolve();
    await released.promise;
  };
  const release = () => released.resolve();
  releases.push(release);
  return {
    release,
    waitForEntries(count = 1) {
      if (entered >= count) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push({ count, resolve }));
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  verification.afterVerify = undefined;
  releases = [];
  logger = {
    info: vi.fn<Logger['info']>(),
    error: vi.fn<Logger['error']>(),
    debug: vi.fn<Logger['debug']>(),
  };
  directory = mkdtempSync(join(tmpdir(), 'ariso-sharing-authorization-'));
  databasePath = join(directory, 'ariso.db');
  connection = openRuntimeDatabase(databasePath);
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'http://localhost:3000',
      timeZone: 'Asia/Shanghai',
    }),
  );
});

afterEach(async () => {
  for (const release of releases) release();
  verification.afterVerify = undefined;
  await runtime?.stop();
  runtime = undefined;
  connection.close();
  rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('production password authorization with migrated disk SQLite', () => {
  it('uses real case-sensitive, space-preserving NFKC verification and stores only a grant digest', async () => {
    const share = await seed({}, ' ＡbＣ ');
    const stored = record(share.id);
    expect(stored.passwordHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(stored.passwordHash).not.toContain('ＡbＣ');
    for (const wrong of [' Abc ', 'AbC', 'wrong']) {
      await expect(unlock(share.token, wrong)).rejects.toMatchObject({
        status: 401,
        code: 'SHARING_PASSWORD_INVALID',
      });
      expect(grants()).toHaveLength(0);
    }
    const grant = await unlock(share.token, ' AbC ');
    expect(grant.grantSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(grant.expiresAt).toEqual(new Date(now + day));
    expect(grants()).toEqual([
      {
        shareId: share.id,
        grantSecretHash: createHash('sha256')
          .update(grant.grantSecret!)
          .digest('hex'),
        authRevision: stored.authRevision,
        verifiedAt: new Date(now),
        expiresAt: new Date(now + day),
      },
    ]);
    expect(JSON.stringify(grants())).not.toContain(grant.grantSecret);
    expect(read(share.token, grant.grantSecret).allowed).toBe(true);
    const diagnostics = JSON.stringify(logger.info.mock.calls);
    for (const secret of [' ＡbＣ ', ' AbC ', share.token, grant.grantSecret!])
      expect(diagnostics).not.toContain(secret);
    expect(logger.info.mock.calls.at(-1)?.[0]).toMatchObject({
      shareId: share.id,
      result: 'verified',
      elapsedMs: expect.any(Number),
    });
  });

  it('requires a matching grant, keeps the fixed deadline after reads, and rejects exactly at 24 hours', async () => {
    const share = await seed();
    expect(read(share.token)).toEqual({ allowed: false, status: 401 });
    const grant = await unlock(share.token, password);
    const initial = grants();
    vi.setSystemTime(now + day - 1);
    for (let i = 0; i < 3; i++)
      expect(read(share.token, grant.grantSecret).allowed).toBe(true);
    expect(grants()).toEqual(initial);
    vi.setSystemTime(now + day);
    expect(read(share.token, grant.grantSecret)).toEqual({
      allowed: false,
      status: 401,
    });
    // Correctness does not wait for scheduled cleanup.
    expect(grants()).toHaveLength(1);
    vi.setSystemTime(now + day + 1);
    expect(read(share.token, grant.grantSecret).allowed).toBe(false);
  });

  it('starts the fixed 24-hour lifetime at verification completion and tolerates concurrent layout edits', async () => {
    const share = await seed();
    const gate = pauseVerification();
    const pending = unlock(share.token);
    await gate.waitForEntries();
    vi.setSystemTime(now + 5000);
    await updateShare(connection.db, share.albumId, {
      layout: 'masonry',
      showName: true,
    });
    gate.release();
    const grant = await pending;
    expect(grant.expiresAt).toEqual(new Date(now + 5000 + day));
    expect(grants()[0]).toMatchObject({
      verifiedAt: new Date(now + 5000),
      expiresAt: new Date(now + 5000 + day),
    });
    expect(read(share.token, grant.grantSecret).allowed).toBe(true);
  });

  it('rejects a stored old-revision grant after password revocation even when its deadline is still live', async () => {
    const share = await seed();
    const grant = await unlock(share.token);
    const oldGrant = grants()[0];
    await updateShare(connection.db, share.albumId, {
      password: { action: 'set', value: 'replacement' },
    });
    // Authorization correctness must still use the revision if an obsolete row
    // remains in storage; expiry and possession of the old secret are insufficient.
    connection.db.insert(shareGrants).values(oldGrant).run();
    expect(grants()).toHaveLength(1);
    expect(read(share.token, grant.grantSecret)).toEqual({
      allowed: false,
      status: 401,
    });
  });

  it('writes independent simultaneous grants for the same album and never accepts another album grant', async () => {
    const a = await seed();
    const b = await seed();
    const [first, second] = await Promise.all([
      unlock(a.token, password),
      unlock(a.token, password),
    ]);
    const other = await unlock(b.token, password);
    expect(first.grantSecret).not.toBe(second.grantSecret);
    expect(grants()).toHaveLength(3);
    for (const grant of [first, second]) {
      expect(read(a.token, grant.grantSecret).allowed).toBe(true);
      expect(read(b.token, grant.grantSecret)).toEqual({
        allowed: false,
        status: 401,
      });
    }
    expect(read(b.token, other.grantSecret).allowed).toBe(true);
    expect(read(a.token, other.grantSecret).allowed).toBe(false);
    await updateShare(connection.db, a.albumId, { enabled: false });
    expect(read(b.token, other.grantSecret).allowed).toBe(true);
  });

  it('persists grants across database shutdown and a fresh Node process without renewing the deadline', async () => {
    const share = await seed();
    const grant = await unlock(share.token, password);
    const initial = grants();
    await runtime!.stop();
    runtime = undefined;
    connection.close();
    try {
      const persisted = JSON.parse(
        execFileSync(
          process.execPath,
          [resolve('tests/integration/sharing/authorization-read.mjs')],
          {
            input: JSON.stringify({
              databasePath,
              token: share.token,
              grantSecret: grant.grantSecret,
              now: now + 1000,
            }),
            encoding: 'utf8',
            timeout: 15000,
          },
        ),
      );
      expect(persisted).toEqual({ allowed: true, shareId: share.id });
    } finally {
      connection = openRuntimeDatabase(databasePath);
    }
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    vi.setSystemTime(now + 1000);
    start();
    expect(grants()).toEqual(initial);
    expect(read(share.token, grant.grantSecret).allowed).toBe(true);
    vi.setSystemTime(now + day);
    expect(read(share.token, grant.grantSecret).allowed).toBe(false);
  });

  it('retains grants for layout, name and future deadline changes while the newest deadline controls access', async () => {
    const share = await seed({ expiresAt: instant(now + 10_000) });
    const grant = await unlock(share.token, password);
    const initial = grants();
    const revision = record(share.id).authRevision;
    await updateShare(connection.db, share.albumId, {
      layout: 'masonry',
      showName: true,
      password: { action: 'keep' },
    });
    await updateShare(connection.db, share.albumId, {
      expiresAt: instant(now + 20_000),
    });
    vi.setSystemTime(now + 1000);
    await updateShare(connection.db, share.albumId, {
      expiresAt: instant(now + 2000),
    });
    expect(record(share.id)).toMatchObject({
      token: share.token,
      layout: 'masonry',
      showName: true,
      authRevision: revision,
    });
    expect(grants()).toEqual(initial);
    vi.setSystemTime(now + 1999);
    expect(read(share.token, grant.grantSecret).allowed).toBe(true);
    vi.setSystemTime(now + 2000);
    expect(read(share.token, grant.grantSecret)).toEqual({
      allowed: false,
      status: 410,
    });
  });

  it.each([null, instant(now + 10_000)])(
    'revokes grants when an expired share is restored to %s without any visitor at expiry',
    async (expiresAt) => {
      const share = await seed({ expiresAt: instant(now + 1000) });
      const grant = await unlock(share.token, password);
      const revision = record(share.id).authRevision;
      vi.setSystemTime(now + 1000);
      await updateShare(connection.db, share.albumId, { expiresAt });
      expect(record(share.id).authRevision).toBe(revision + 1);
      expect(grants()).toHaveLength(0);
      expect(read(share.token, grant.grantSecret)).toEqual({
        allowed: false,
        status: 401,
      });
      const fresh = await unlock(share.token, password);
      expect(read(share.token, fresh.grantSecret).allowed).toBe(true);
    },
  );

  it('closing, replacing and clearing a password each revoke grants while retaining the address', async () => {
    const share = await seed();
    const first = await unlock(share.token, password);
    const revision = record(share.id).authRevision;
    const closed = await updateShare(connection.db, share.albumId, {
      enabled: false,
    });
    expect(closed.token).toBe(share.token);
    expect(record(share.id).authRevision).toBe(revision + 1);
    expect(grants()).toHaveLength(0);
    expect(read(share.token, first.grantSecret)).toEqual({
      allowed: false,
      status: 410,
    });
    await updateShare(connection.db, share.albumId, { enabled: true });
    expect(read(share.token, first.grantSecret).allowed).toBe(false);
    const second = await unlock(share.token, password);
    await updateShare(connection.db, share.albumId, {
      password: { action: 'set', value: 'replacement' },
    });
    expect(grants()).toHaveLength(0);
    expect(read(share.token, second.grantSecret).allowed).toBe(false);
    await expect(unlock(share.token, password)).rejects.toMatchObject({
      status: 401,
    });
    const third = await unlock(share.token, 'replacement');
    const cleared = await updateShare(connection.db, share.albumId, {
      password: { action: 'clear' },
    });
    expect(cleared).toMatchObject({ token: share.token, hasPassword: false });
    expect(grants()).toHaveLength(0);
    expect(read(share.token).allowed).toBe(true);
    await updateShare(connection.db, share.albumId, {
      password: { action: 'set', value: password },
    });
    expect(read(share.token, third.grantSecret).allowed).toBe(false);
    expect(read(share.token).allowed).toBe(false);
  });

  it('rotation removes old grants and album deletion cascades the share and newly issued grants', async () => {
    const share = await seed({ layout: 'masonry', showName: true });
    const grant = await unlock(share.token, password);
    const rotated = rotateShare(connection.db, share.albumId);
    expect(rotated).toMatchObject({
      layout: 'masonry',
      showName: true,
      hasPassword: true,
      enabled: true,
    });
    expect(rotated.token).not.toBe(share.token);
    expect(grants()).toHaveLength(0);
    expect(read(share.token, grant.grantSecret)).toEqual({
      allowed: false,
      status: 404,
    });
    expect(read(rotated.token, grant.grantSecret).allowed).toBe(false);
    const fresh = await unlock(rotated.token, password);
    expect(grants()).toHaveLength(1);
    connection.db.transaction((tx) => deleteAlbum(tx, share.albumId));
    expect(connection.db.select().from(albumShares).all()).toHaveLength(0);
    expect(grants()).toHaveLength(0);
    expect(read(rotated.token, fresh.grantSecret)).toEqual({
      allowed: false,
      status: 404,
    });
  });

  it.each([
    { operation: 'password', status: 409 },
    { operation: 'clear', status: 409 },
    { operation: 'close', status: 410 },
    { operation: 'expire', status: 410 },
    { operation: 'rotate', status: 404 },
    { operation: 'delete', status: 404 },
  ])(
    'refuses a stale real verification after concurrent $operation with status $status and no grant',
    async ({ operation, status }) => {
      const share = await seed(
        operation === 'expire' ? { expiresAt: instant(now + 1) } : {},
      );
      const gate = pauseVerification();
      const pending = start()
        .unlock(share.token, password)
        .catch((error: unknown) => error);
      await gate.waitForEntries();
      try {
        if (operation === 'password')
          await updateShare(connection.db, share.albumId, {
            password: { action: 'set', value: 'changed' },
          });
        else if (operation === 'clear')
          await updateShare(connection.db, share.albumId, {
            password: { action: 'clear' },
          });
        else if (operation === 'close')
          await updateShare(connection.db, share.albumId, { enabled: false });
        else if (operation === 'expire') vi.setSystemTime(now + 1);
        else if (operation === 'rotate')
          rotateShare(connection.db, share.albumId);
        else connection.db.transaction((tx) => deleteAlbum(tx, share.albumId));
      } finally {
        gate.release();
      }
      expect(await pending).toMatchObject({ status });
      expect(grants()).toHaveLength(0);
    },
  );

  it('returns the uniform wrong-password result after actual hashing without writing a grant', async () => {
    const share = await seed();
    const gate = pauseVerification();
    const pending = start()
      .unlock(share.token, 'incorrect')
      .catch((error: unknown) => error);
    await gate.waitForEntries();
    expect(grants()).toHaveLength(0);
    gate.release();
    expect(await pending).toMatchObject({
      status: 401,
      code: 'SHARING_PASSWORD_INVALID',
      message: '密码错误，请重试',
    });
    expect(grants()).toHaveLength(0);
  });
});

describe('production hash limits and runtime ownership', () => {
  it('permits exactly twenty real attempts per share and resets exactly at one minute', async () => {
    const share = await seed();
    const other = await seed();
    for (let i = 0; i < 20; i++)
      await expect(unlock(share.token, 'incorrect')).rejects.toMatchObject({
        status: 401,
      });
    expect(grants()).toHaveLength(0);
    await expect(unlock(share.token, password)).rejects.toMatchObject({
      status: 429,
      retryAfter: 60,
    });
    expect((await unlock(other.token, password)).grantSecret).toBeTruthy();
    vi.setSystemTime(now + 59_999);
    await expect(unlock(share.token, password)).rejects.toMatchObject({
      status: 429,
      retryAfter: 1,
    });
    vi.setSystemTime(now + 60_000);
    const grant = await unlock(share.token, password);
    expect(read(share.token, grant.grantSecret).allowed).toBe(true);
  }, 10000);

  it('allows two real verifications across albums, rejects a third, and releases both slots on completion', async () => {
    const a = await seed();
    const b = await seed();
    const c = await seed();
    const gate = pauseVerification();
    const first = unlock(a.token, password);
    const second = unlock(b.token, password);
    await gate.waitForEntries(2);
    await expect(unlock(c.token, password)).rejects.toMatchObject({
      status: 429,
      retryAfter: 1,
    });
    expect(grants()).toHaveLength(0);
    gate.release();
    const completed = await Promise.all([first, second]);
    expect(completed.every((grant) => !!grant.grantSecret)).toBe(true);
    expect(grants()).toHaveLength(2);
    const third = await unlock(c.token, password);
    expect(read(c.token, third.grantSecret).allowed).toBe(true);
  });

  it('a real malformed-hash failure remains diagnosable and releases capacity for another album', async () => {
    const a = await seed();
    const broken = await seed();
    const c = await seed();
    connection.db
      .update(albumShares)
      .set({ passwordHash: 'invalid-password-hash' })
      .where(eq(albumShares.id, broken.id))
      .run();
    const gate = pauseVerification();
    const first = unlock(a.token, password);
    await gate.waitForEntries();
    await expect(unlock(broken.token, password)).rejects.toThrow(
      'Invalid password hash',
    );
    const second = unlock(c.token, password);
    await gate.waitForEntries(2);
    expect(logger.error.mock.calls.at(-1)).toEqual([
      expect.objectContaining({
        shareId: broken.id,
        result: 'error',
        err: expect.objectContaining({ message: 'Invalid password hash' }),
      }),
      'Share password verification failed',
    ]);
    const diagnostics = JSON.stringify(logger.error.mock.calls);
    expect(diagnostics).not.toContain(password);
    expect(diagnostics).not.toContain(broken.token);
    expect(grants()).toHaveLength(0);
    gate.release();
    await Promise.all([first, second]);
    expect(grants()).toHaveLength(2);
  });

  it('prunes bounded batches at startup and while running, retains live grants, and cancels cleanup on stop', async () => {
    vi.useFakeTimers({
      toFake: [
        'Date',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
      ],
    });
    vi.setSystemTime(now);
    const share = await seed();
    const insert = (prefix: string, count: number, expiresAt: number) => {
      connection.db.transaction((tx) => {
        for (let i = 0; i < count; i++)
          tx.insert(shareGrants)
            .values({
              shareId: share.id,
              grantSecretHash: `${prefix}-${i}`,
              authRevision: record(share.id).authRevision,
              verifiedAt: new Date(now - day),
              expiresAt: new Date(expiresAt),
            })
            .run();
      });
    };
    insert('expired', 2501, now);
    insert('live', 1, now + 120_000);
    expect(pruneShareGrants(connection.db, new Date())).toBe(1000);
    expect(grants()).toHaveLength(1502);
    start();
    await vi.advanceTimersByTimeAsync(1);
    expect(grants().map((grant) => grant.grantSecretHash)).toEqual(['live-0']);
    insert('running', 2001, now + 60_000);
    await vi.advanceTimersByTimeAsync(59_998);
    expect(grants()).toHaveLength(2002);
    // The interval batch and the two following setImmediate batches each yield.
    await vi.advanceTimersByTimeAsync(3);
    expect(grants().map((grant) => grant.grantSecretHash)).toEqual(['live-0']);
    await runtime!.stop();
    expect(vi.getTimerCount()).toBe(0);
    insert('after-stop', 1, now);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(grants()).toHaveLength(2);
  });

  it('waits for an active real hash before stop resolves and rejects new work while stopping', async () => {
    const share = await seed();
    const gate = pauseVerification();
    const pending = unlock(share.token, password);
    await gate.waitForEntries();
    let stopped = false;
    const stopping = runtime!.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(() => runtime!.unlock(share.token, password)).toThrowError(
      expect.objectContaining({ status: 503, code: 'SHARING_STOPPING' }),
    );
    expect(grants()).toHaveLength(0);
    gate.release();
    const grant = await pending;
    await stopping;
    expect(stopped).toBe(true);
    expect(read(share.token, grant.grantSecret).allowed).toBe(true);
    expect(grants()).toHaveLength(1);
  });
});
