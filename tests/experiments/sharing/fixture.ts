import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { openFixture } from '../identity/fixture.ts';

export const grantLifetime = 24 * 60 * 60 * 1000;
export const secret = () => randomBytes(32).toString('base64url');
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export type Share = {
  id: string;
  token: string;
  revision: number;
  enabled: number;
  passwordHash: string | null;
  expiresAt: number | null;
  layout: 'grid' | 'masonry';
  showName: number;
};
export type Patch = {
  password?: string | null;
  expiresAt?: number | null;
  enabled?: boolean;
  layout?: Share['layout'];
  showName?: boolean;
  rotate?: boolean;
  deleted?: boolean;
};
export type Kind = 'unlock' | 'items' | 'refresh' | 'neighbors';

// Isolated protocol model, never imported by src or included in its migrations.
export function openSharingFixture(path: string, now: () => number) {
  const connection = openFixture(path);
  const sqlite = connection.db.$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS experiment_shares (
      id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL,
      enabled INTEGER NOT NULL, passwordHash TEXT, expiresAt INTEGER,
      layout TEXT NOT NULL, showName INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS experiment_grants (
      shareId TEXT REFERENCES experiment_shares(id) ON DELETE CASCADE,
      secretHash TEXT NOT NULL, revision INTEGER NOT NULL,
      verifiedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL,
      PRIMARY KEY (shareId, secretHash)
    );
    CREATE TABLE IF NOT EXISTS experiment_members (
      shareId TEXT REFERENCES experiment_shares(id) ON DELETE CASCADE,
      imageId TEXT NOT NULL, public INTEGER NOT NULL, trashed INTEGER NOT NULL,
      name TEXT NOT NULL, PRIMARY KEY (shareId, imageId)
    );
  `);
  const gates = new Map<
    string,
    {
      id: string;
      kind: Kind;
      entered: number;
      release: () => void;
      wait: Promise<void>;
    }
  >();
  const requests: { kind: string; id: string; ids?: string[] }[] = [];
  const readId = (id: string) =>
    sqlite.prepare('SELECT * FROM experiment_shares WHERE id = ?').get(id) as
      Share | undefined;
  const readToken = (token: string) =>
    sqlite
      .prepare('SELECT * FROM experiment_shares WHERE token = ?')
      .get(token) as Share | undefined;
  function access(share: Share | undefined, grantSecret?: string) {
    if (!share) return 404;
    if (
      !share.enabled ||
      (share.expiresAt !== null && now() >= share.expiresAt)
    )
      return 410;
    if (!share.passwordHash) return 200;
    if (!grantSecret) return 401;
    const grant = sqlite
      .prepare(
        'SELECT 1 FROM experiment_grants WHERE shareId = ? AND secretHash = ? AND revision = ? AND expiresAt > ?',
      )
      .get(share.id, digest(grantSecret), share.revision, now());
    return grant ? 200 : 401;
  }
  async function wait(id: string, kind: Kind) {
    const gate = gates.get(`${id}:${kind}`);
    if (gate) {
      gate.entered++;
      await gate.wait;
    }
  }
  async function seed(id: string, password: string | null) {
    const hash = password === null ? null : await hashPassword(password);
    sqlite.transaction(() => {
      sqlite
        .prepare(
          'INSERT INTO experiment_shares VALUES (?, ?, 1, 1, ?, NULL, ?, 0)',
        )
        .run(id, secret(), hash, 'grid');
      const insert = sqlite.prepare(
        'INSERT INTO experiment_members VALUES (?, ?, ?, ?, ?)',
      );
      for (let index = 0; index < 161; index++) {
        const imageId = `img-${String(index).padStart(3, '0')}`;
        insert.run(id, imageId, 1, 0, `name-${imageId}`);
      }
      insert.run(id, 'private-image', 0, 0, 'PRIVATE NAME');
      insert.run(id, 'trashed-image', 1, 1, 'TRASH NAME');
    })();
    return readId(id)!;
  }
  async function change(id: string, patch: Patch) {
    const hash =
      typeof patch.password === 'string'
        ? await hashPassword(patch.password)
        : patch.password;
    return sqlite.transaction(() => {
      const current = readId(id);
      if (!current) throw new Error(`Missing experimental share: ${id}`);
      if (patch.deleted) {
        sqlite.prepare('DELETE FROM experiment_shares WHERE id = ?').run(id);
        return null;
      }
      const revoke =
        patch.enabled === false ||
        patch.password !== undefined ||
        patch.rotate ||
        (current.expiresAt !== null && now() >= current.expiresAt);
      const next: Share = {
        ...current,
        token: patch.rotate ? secret() : current.token,
        revision: current.revision + (revoke ? 1 : 0),
        enabled:
          patch.enabled === undefined ? current.enabled : Number(patch.enabled),
        passwordHash: hash === undefined ? current.passwordHash : hash,
        expiresAt:
          patch.expiresAt === undefined ? current.expiresAt : patch.expiresAt,
        layout: patch.layout ?? current.layout,
        showName:
          patch.showName === undefined
            ? current.showName
            : Number(patch.showName),
      };
      sqlite
        .prepare(
          'UPDATE experiment_shares SET token=@token, revision=@revision, enabled=@enabled, passwordHash=@passwordHash, expiresAt=@expiresAt, layout=@layout, showName=@showName WHERE id=@id',
        )
        .run(next);
      if (revoke)
        sqlite
          .prepare('DELETE FROM experiment_grants WHERE shareId = ?')
          .run(id);
      return next;
    })();
  }
  async function unlock(token: string, password: string) {
    const initial = readToken(token);
    const status = access(initial);
    if (status !== 401) return { status };
    // Cheap access checks precede expensive hashing; no asynchronous SQLite transaction.
    const verified = await verifyPassword({
      hash: initial!.passwordHash!,
      password,
    });
    await wait(initial!.id, 'unlock');
    return sqlite.transaction(() => {
      const current = readToken(token);
      const currentStatus = access(current);
      if (currentStatus !== 401)
        return { status: currentStatus === 200 ? 409 : currentStatus };
      if (!verified) return { status: 401 };
      if (current!.revision !== initial!.revision) return { status: 409 };
      const grantSecret = secret();
      const verifiedAt = now();
      sqlite
        .prepare('INSERT INTO experiment_grants VALUES (?, ?, ?, ?, ?)')
        .run(
          current!.id,
          digest(grantSecret),
          current!.revision,
          verifiedAt,
          verifiedAt + grantLifetime,
        );
      return {
        status: 200,
        grantSecret,
        expiresAt: verifiedAt + grantLifetime,
      };
    })();
  }
  function read(
    token: string,
    grantSecret: string | undefined,
    kind: string,
    ids?: string[],
  ) {
    return sqlite.transaction(() => {
      const share = readToken(token);
      const status = access(share, grantSecret);
      if (status !== 200) return { status, body: { status } };
      requests.push({ kind, id: share!.id, ...(ids ? { ids } : {}) });
      const rows = sqlite
        .prepare(
          'SELECT imageId, name FROM experiment_members WHERE shareId = ? AND public = 1 AND trashed = 0 ORDER BY imageId',
        )
        .all(share!.id) as { imageId: string; name: string }[];
      const selected = ids
        ? rows.filter((row) => ids.includes(row.imageId))
        : rows;
      return {
        status,
        body: {
          albumName: `album-${share!.id}`,
          layout: share!.layout,
          showName: Boolean(share!.showName),
          items: selected.map((row) => ({
            id: row.imageId,
            ...(share!.showName ? { displayName: row.name } : {}),
          })),
        },
      };
    })();
  }
  return {
    connection,
    sqlite,
    seed,
    change,
    unlock,
    read,
    readToken,
    wait,
    member(id: string, imageId: string, isPublic: boolean, trashed: boolean) {
      sqlite
        .prepare(
          'UPDATE experiment_members SET public = ?, trashed = ? WHERE shareId = ? AND imageId = ?',
        )
        .run(Number(isPublic), Number(trashed), id, imageId);
    },
    gate(id: string, kind: Kind, enabled: boolean) {
      const key = `${id}:${kind}`;
      gates.get(key)?.release();
      gates.delete(key);
      if (!enabled) return;
      let release!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      gates.set(key, { id, kind, entered: 0, release, wait });
    },
    release(id: string, kind: Kind) {
      gates.get(`${id}:${kind}`)?.release();
    },
    probe() {
      return {
        gates: [...gates.values()].map(({ id, kind, entered }) => ({
          id,
          kind,
          entered,
        })),
        requests,
        grantCount: (
          sqlite
            .prepare('SELECT COUNT(*) AS count FROM experiment_grants')
            .get() as { count: number }
        ).count,
      };
    },
    close() {
      for (const gate of gates.values()) gate.release();
      connection.close();
    },
  };
}
