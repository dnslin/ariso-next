import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAlbum,
  deleteAlbum,
} from '../../../src/server/collections/records.ts';
import { albums } from '../../../src/server/collections/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import {
  initializeSiteSettings,
  updateSiteSettings,
} from '../../../src/server/site/settings.ts';
import {
  createShare,
  listShares,
  parseShareQuery,
  readOwnerShare,
  rotateShare,
  updateShare,
} from '../../../src/server/sharing/configuration.ts';
import {
  albumShares,
  shareGrants,
} from '../../../src/server/sharing/schema.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
const now = new Date('2026-10-05T10:00:00Z');
const future = '2026-10-06T10:00:00.000Z';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  directory = mkdtempSync(join(tmpdir(), 'ariso-share-config-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'https://images.example.test',
      timeZone: 'Asia/Shanghai',
    }),
  );
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});
const album = (name = '旅行') =>
  connection.db.transaction((tx) => createAlbum(tx, { name }));
const record = (id: string) =>
  connection.db.select().from(albumShares).where(eq(albumShares.id, id)).get()!;
function seedGrant(id: string) {
  const secret = randomBytes(32).toString('base64url');
  connection.db
    .insert(shareGrants)
    .values({
      shareId: id,
      grantSecretHash: createHash('sha256').update(secret).digest('hex'),
      authRevision: record(id).authRevision,
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .run();
  return connection.db
    .select()
    .from(shareGrants)
    .where(eq(shareGrants.shareId, id))
    .all();
}

describe('分享配置真实 SQLite 与密码哈希', () => {
  it('未创建时无分享记录，首次明确创建启用并持久保存随机地址与默认设置', async () => {
    const ownerAlbum = album();
    expect(readOwnerShare(connection.db, ownerAlbum.id)).toBeNull();
    expect(() => readOwnerShare(connection.db, 'missing')).toThrowError(
      expect.objectContaining({ status: 404 }),
    );
    const share = await createShare(connection.db, ownerAlbum.id);
    expect(share).toMatchObject({
      albumId: ownerAlbum.id,
      albumName: '旅行',
      enabled: true,
      hasPassword: false,
      expiresAt: null,
      layout: 'grid',
      showName: false,
      state: 'enabled',
    });
    expect(Buffer.from(share.token, 'base64url')).toHaveLength(32);
    expect(share.token).not.toContain(ownerAlbum.id);
    expect(share.url).toBe(`https://images.example.test/s/${share.token}`);
    expect(Object.keys(share)).not.toContain('passwordHash');
    expect(Object.keys(share)).not.toContain('authRevision');
    expect(record(share.id).authRevision).toBe(1);
    expect(
      connection.db.$client
        .prepare('SELECT created_at, updated_at FROM album_shares')
        .get(),
    ).toEqual({ created_at: now.getTime(), updated_at: now.getTime() });
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    expect(readOwnerShare(connection.db, ownerAlbum.id)).toEqual(share);
  });

  it('重复创建返回当前记录，不覆盖密码、期限、关闭状态或地址', async () => {
    const ownerAlbum = album();
    const first = await createShare(connection.db, ownerAlbum.id, {
      password: { action: 'set', value: '原密码' },
      expiresAt: future,
      layout: 'masonry',
      showName: true,
    });
    await updateShare(connection.db, ownerAlbum.id, { enabled: false });
    const current = readOwnerShare(connection.db, ownerAlbum.id);
    const hash = record(first.id).passwordHash;
    expect(
      await createShare(connection.db, ownerAlbum.id, {
        password: { action: 'set', value: '新密码' },
        expiresAt: null,
      }),
    ).toEqual(current);
    await expect(
      createShare(connection.db, ownerAlbum.id, {
        password: null,
        token: 'override',
      }),
    ).rejects.toMatchObject({ code: 'SHARING_INVALID_INPUT', status: 400 });
    expect(readOwnerShare(connection.db, ownerAlbum.id)).toEqual(current);
    expect(record(first.id).passwordHash).toBe(hash);
    expect(connection.db.select().from(albumShares).all()).toHaveLength(1);
  });

  it('并发跨连接创建使用同一分享，哈希期间不持有数据库事务', async () => {
    const ownerAlbum = album();
    const other = openRuntimeDatabase(join(directory, 'ariso.db'));
    try {
      const first = createShare(connection.db, ownerAlbum.id, {
        password: { action: 'set', value: 'first' },
      });
      const second = createShare(other.db, ownerAlbum.id, {
        password: { action: 'set', value: 'second' },
        layout: 'masonry',
      });
      expect(connection.db.$client.inTransaction).toBe(false);
      expect(other.db.$client.inTransaction).toBe(false);
      const shares = await Promise.all([first, second]);
      expect(shares[0]).toEqual(shares[1]);
      expect(connection.db.select().from(albumShares).all()).toHaveLength(1);
      const hash = record(shares[0].id).passwordHash!;
      const matches = await Promise.all(
        ['first', 'second'].map((password) =>
          verifyPassword({ hash, password }),
        ),
      );
      expect(matches.filter(Boolean)).toHaveLength(1);
    } finally {
      other.close();
    }
  });

  it('密码保留大小写和空格，复用 Better Auth NFKC，不保存或回显原始密码', async () => {
    const ownerAlbum = album();
    const share = await createShare(connection.db, ownerAlbum.id, {
      password: { action: 'set', value: ' Ａbc ' },
    });
    const hash = record(share.id).passwordHash!;
    expect(hash).not.toContain(' Ａbc ');
    expect(await verifyPassword({ hash, password: ' Abc ' })).toBe(true);
    expect(await verifyPassword({ hash, password: ' abc ' })).toBe(false);
    expect(await verifyPassword({ hash, password: 'Abc' })).toBe(false);
    expect(
      JSON.stringify(readOwnerShare(connection.db, ownerAlbum.id)),
    ).not.toContain(hash);
    expect(
      JSON.stringify(
        listShares(connection.db, parseShareQuery(new URLSearchParams())),
      ),
    ).not.toContain(hash);
  });

  it('仅更新提交字段，保留密码的布局与名称更新不撤销授权', async () => {
    const ownerAlbum = album();
    const share = await createShare(connection.db, ownerAlbum.id, {
      password: { action: 'set', value: '密码' },
      expiresAt: future,
    });
    const current = record(share.id);
    const grants = seedGrant(share.id);
    const saved = await updateShare(connection.db, ownerAlbum.id, {
      password: { action: 'keep' },
      layout: 'masonry',
      showName: true,
    });
    expect(saved).toMatchObject({
      layout: 'masonry',
      showName: true,
      expiresAt: future,
      token: share.token,
    });
    expect(record(share.id)).toMatchObject({
      passwordHash: current.passwordHash,
      authRevision: current.authRevision,
    });
    expect(connection.db.select().from(shareGrants).all()).toEqual(grants);
    await expect(
      updateShare(connection.db, ownerAlbum.id, {
        password: { action: 'set', value: '' },
      }),
    ).rejects.toMatchObject({ code: 'SHARING_INVALID_INPUT' });
    expect(record(share.id).passwordHash).toBe(current.passwordHash);
  });

  it('密码设置保存时重读当前配置，不覆盖哈希期间的关闭、地址和其他字段修改', async () => {
    const ownerAlbum = album();
    const share = await createShare(connection.db, ownerAlbum.id);
    const pending = updateShare(connection.db, ownerAlbum.id, {
      password: { action: 'set', value: '新密码' },
    });
    expect(connection.db.$client.inTransaction).toBe(false);
    await updateShare(connection.db, ownerAlbum.id, {
      enabled: false,
      layout: 'masonry',
      showName: true,
    });
    const rotated = rotateShare(connection.db, ownerAlbum.id);
    const saved = await pending;
    expect(saved).toMatchObject({
      enabled: false,
      layout: 'masonry',
      showName: true,
      token: rotated.token,
      hasPassword: true,
    });
    expect(record(share.id).authRevision).toBe(4);
  });

  it('添加、替换、清除密码和关闭都递增 revision 并删除授权；重新开启保留地址', async () => {
    const ownerAlbum = album();
    const share = await createShare(connection.db, ownerAlbum.id);
    let revision = record(share.id).authRevision;
    for (const patch of [
      { password: { action: 'set', value: 'first' } },
      { password: { action: 'set', value: 'second' } },
      { password: { action: 'clear' } },
      { enabled: false },
    ]) {
      seedGrant(share.id);
      const saved = await updateShare(connection.db, ownerAlbum.id, patch);
      expect(saved.token).toBe(share.token);
      expect(record(share.id).authRevision).toBe(++revision);
      expect(connection.db.select().from(shareGrants).all()).toEqual([]);
    }
    expect(
      await updateShare(connection.db, ownerAlbum.id, { enabled: true }),
    ).toMatchObject({ enabled: true, hasPassword: false, token: share.token });
    expect(record(share.id).authRevision).toBe(revision);
  });

  it('未来期限缩短、延长和清除均保留授权和地址', async () => {
    const ownerAlbum = album();
    const share = await createShare(connection.db, ownerAlbum.id, {
      expiresAt: future,
    });
    const grants = seedGrant(share.id);
    for (const expiresAt of [
      '2026-10-05T11:00:00Z',
      '2026-10-07T10:00:00Z',
      null,
    ]) {
      const saved = await updateShare(connection.db, ownerAlbum.id, {
        expiresAt,
      });
      expect(saved.token).toBe(share.token);
      expect(record(share.id).authRevision).toBe(1);
      expect(connection.db.select().from(shareGrants).all()).toEqual(grants);
    }
  });

  it('恰好到期为 expired；布局编辑保留旧期限并撤销，启用必须同时延期或清除', async () => {
    const ownerAlbum = album();
    const share = await createShare(connection.db, ownerAlbum.id, {
      expiresAt: future,
    });
    seedGrant(share.id);
    vi.setSystemTime(new Date(future));
    expect(readOwnerShare(connection.db, ownerAlbum.id)?.state).toBe('expired');
    expect(
      await updateShare(connection.db, ownerAlbum.id, { layout: 'masonry' }),
    ).toMatchObject({
      expiresAt: future,
      state: 'expired',
      token: share.token,
    });
    expect(record(share.id).authRevision).toBe(2);
    expect(connection.db.select().from(shareGrants).all()).toEqual([]);
    await expect(
      updateShare(connection.db, ownerAlbum.id, { enabled: true }),
    ).rejects.toMatchObject({ code: 'SHARING_INVALID_INPUT' });
    expect(record(share.id).authRevision).toBe(2);
    expect(
      await updateShare(connection.db, ownerAlbum.id, {
        enabled: true,
        expiresAt: null,
      }),
    ).toMatchObject({ expiresAt: null, state: 'enabled', token: share.token });
    expect(record(share.id).authRevision).toBe(3);
  });

  it('新期限必须严格晚于实际保存时刻，哈希期间时间推进也不得写入过期期限', async () => {
    const ownerAlbum = album();
    await expect(
      createShare(connection.db, ownerAlbum.id, {
        expiresAt: now.toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'SHARING_INVALID_INPUT' });
    const share = await createShare(connection.db, ownerAlbum.id);
    const saved = record(share.id);
    const deadline = new Date(now.getTime() + 1).toISOString();
    const pending = updateShare(connection.db, ownerAlbum.id, {
      password: { action: 'set', value: '密码' },
      expiresAt: deadline,
    });
    vi.setSystemTime(new Date(deadline));
    await expect(pending).rejects.toMatchObject({
      code: 'SHARING_INVALID_INPUT',
    });
    expect(record(share.id)).toEqual(saved);
  });

  it('哈希期间删除相册不能创建孤立分享或更新已删除分享', async () => {
    const ownerAlbum = album();
    const pending = createShare(connection.db, ownerAlbum.id, {
      password: { action: 'set', value: '密码' },
    });
    connection.db.transaction((tx) => deleteAlbum(tx, ownerAlbum.id));
    await expect(pending).rejects.toMatchObject({ status: 404 });
    expect(connection.db.select().from(albumShares).all()).toEqual([]);
    const another = album('稍后删除');
    await createShare(connection.db, another.id);
    const updating = updateShare(connection.db, another.id, {
      password: { action: 'set', value: '新密码' },
    });
    connection.db.transaction((tx) => deleteAlbum(tx, another.id));
    await expect(updating).rejects.toMatchObject({ status: 404 });
    expect(connection.db.select().from(albumShares).all()).toEqual([]);
  });

  it('重生成只更换随机 Token 并撤销授权，保留其他配置；删除相册级联清除分享授权', async () => {
    const ownerAlbum = album();
    const first = await createShare(connection.db, ownerAlbum.id, {
      password: { action: 'set', value: '密码' },
      expiresAt: future,
      layout: 'masonry',
      showName: true,
    });
    const before = record(first.id);
    seedGrant(first.id);
    const rotated = rotateShare(connection.db, ownerAlbum.id);
    expect(rotated.token).not.toBe(first.token);
    expect(Buffer.from(rotated.token, 'base64url')).toHaveLength(32);
    expect(record(first.id)).toMatchObject({
      passwordHash: before.passwordHash,
      expiresAt: before.expiresAt,
      enabled: before.enabled,
      layout: before.layout,
      showName: before.showName,
      authRevision: before.authRevision + 1,
    });
    expect(connection.db.select().from(shareGrants).all()).toEqual([]);
    seedGrant(first.id);
    connection.db.transaction((tx) => deleteAlbum(tx, ownerAlbum.id));
    expect(connection.db.select().from(albumShares).all()).toEqual([]);
    expect(connection.db.select().from(shareGrants).all()).toEqual([]);
    expect(connection.db.$client.pragma('foreign_key_check')).toEqual([]);
  });

  it('站点地址变化只改变新读取的 URL，时区变化不修改持久化 UTC 期限', async () => {
    const ownerAlbum = album();
    const first = await createShare(connection.db, ownerAlbum.id, {
      expiresAt: future,
    });
    connection.db.transaction((tx) =>
      updateSiteSettings(tx, {
        publicUrl: 'https://new.example.test',
        timeZone: 'America/New_York',
      }),
    );
    expect(readOwnerShare(connection.db, ownerAlbum.id)).toEqual({
      ...first,
      url: `https://new.example.test/s/${first.token}`,
    });
    expect(
      connection.db.$client
        .prepare('SELECT expires_at FROM album_shares')
        .get(),
    ).toEqual({ expires_at: Date.parse(future) });
  });

  it('数据库唯一约束拒绝同相册和同 Token 的第二条记录，错误不隐藏', async () => {
    const firstAlbum = album();
    const secondAlbum = album('其他');
    const share = await createShare(connection.db, firstAlbum.id);
    const row = record(share.id);
    expect(() =>
      connection.db
        .insert(albumShares)
        .values({ ...row, id: 'duplicate-album', token: 'other-token' })
        .run(),
    ).toThrow();
    expect(() =>
      connection.db
        .insert(albumShares)
        .values({ ...row, id: 'duplicate-token', albumId: secondAlbum.id })
        .run(),
    ).toThrow();
    expect(() =>
      connection.db
        .update(albumShares)
        .set({ layout: 'invalid' as 'grid' })
        .run(),
    ).toThrow();
    expect(connection.db.select().from(albumShares).all()).toEqual([row]);
  });

  it('读取站点发生故障时整次保存回滚，撤销 revision 和删除授权也一起回滚', async () => {
    const ownerAlbum = album();
    const share = await createShare(connection.db, ownerAlbum.id);
    const row = record(share.id);
    const grants = seedGrant(share.id);
    connection.db.delete(siteSettings).run();
    await expect(
      updateShare(connection.db, ownerAlbum.id, { enabled: false }),
    ).rejects.toMatchObject({ code: 'SITE_NOT_INITIALIZED' });
    expect(record(share.id)).toEqual(row);
    expect(connection.db.select().from(shareGrants).all()).toEqual(grants);
  });

  it('管理列表稳定分页并按相册名称字面查询，只返回有分享记录的相册', async () => {
    album('未分享相册');
    for (let index = 0; index < 85; index++) {
      const id = String(index).padStart(3, '0');
      const stamp = new Date(index === 84 ? 2000 : 1000);
      connection.db
        .insert(albums)
        .values({
          id: `album-${id}`,
          name: index === 0 ? 'é%_相册' : '相册',
          description: '',
          createdAt: stamp,
          updatedAt: stamp,
        })
        .run();
      connection.db
        .insert(albumShares)
        .values({
          id: `share-${id}`,
          albumId: `album-${id}`,
          token: `token-${id}`,
          enabled: index % 2 === 0,
          passwordHash: null,
          expiresAt: null,
          layout: 'grid',
          showName: false,
          authRevision: 1,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .run();
    }
    for (const pageSize of [20, 40, 80]) {
      const pages = Array.from(
        { length: Math.ceil(85 / pageSize) },
        (_, index) =>
          listShares(
            connection.db,
            parseShareQuery(
              new URLSearchParams({
                pageSize: String(pageSize),
                page: String(index + 1),
              }),
            ),
          ),
      );
      expect(pages.every((page) => page.total === 85)).toBe(true);
      expect(
        pages.flatMap((page) => page.items.map((item) => item.id)),
      ).toEqual([
        'share-084',
        ...Array.from(
          { length: 84 },
          (_, index) => `share-${String(index).padStart(3, '0')}`,
        ),
      ]);
    }
    expect(
      listShares(
        connection.db,
        parseShareQuery(new URLSearchParams({ q: ' e\u0301%_ ' })),
      ).items.map((item) => item.id),
    ).toEqual(['share-000']);
    expect(
      listShares(
        connection.db,
        parseShareQuery(new URLSearchParams({ page: '99' })),
      ),
    ).toMatchObject({ items: [], total: 85 });
    for (const query of [
      'page=0',
      'page=1&page=2',
      'pageSize=100',
      'enabled=true',
      'pageSize=',
    ]) {
      expect(() => parseShareQuery(new URLSearchParams(query))).toThrowError(
        expect.objectContaining({ code: 'SHARING_INVALID_INPUT' }),
      );
    }
  });
});
